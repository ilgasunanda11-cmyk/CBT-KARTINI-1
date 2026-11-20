import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { getDb } from '../database/db.ts';

export const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const ALLOWED_AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg']);
export const ALLOWED_AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/ogg',
  'application/ogg',
]);

export function getMediaSizeLimits(): { maxImageBytes: number; maxAudioBytes: number } {
  const defaultImg = Number(process.env.MAX_IMAGE_SIZE_BYTES || 10 * 1024 * 1024);
  const defaultAud = Number(process.env.MAX_AUDIO_SIZE_BYTES || 25 * 1024 * 1024);
  try {
    const db = getDb();
    const imgRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'max_image_size_mb'`).get() as { value: string } | undefined;
    const audRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'max_audio_size_mb'`).get() as { value: string } | undefined;
    return {
      maxImageBytes: imgRow ? Number(imgRow.value) * 1024 * 1024 : defaultImg,
      maxAudioBytes: audRow ? Number(audRow.value) * 1024 * 1024 : defaultAud,
    };
  } catch {
    return { maxImageBytes: defaultImg, maxAudioBytes: defaultAud };
  }
}

export function validateMagicBytes(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 4) return false;

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case '.png':
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    case '.webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case '.wav':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WAVE'
      );
    case '.ogg':
      return buffer.subarray(0, 4).toString('ascii') === 'OggS';
    case '.mp3':
      return (
        buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
      );
    case '.m4a':
      return buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    default:
      return false;
  }
}

export function detectMediaType(filename: string, mimeType: string): 'IMAGE' | 'AUDIO' | null {
  const ext = path.extname(filename).toLowerCase();
  if (ALLOWED_IMAGE_EXT.has(ext) && (ALLOWED_IMAGE_MIME.has(mimeType) || mimeType === 'application/octet-stream')) {
    return 'IMAGE';
  }
  if (ALLOWED_AUDIO_EXT.has(ext) && (ALLOWED_AUDIO_MIME.has(mimeType) || mimeType === 'application/octet-stream')) {
    return 'AUDIO';
  }
  return null;
}

export function saveMediaBufferToDisk(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  overrideExt?: string
): { filename: string; storagePath: string; mediaType: 'IMAGE' | 'AUDIO'; ext: string } {
  const ext = (overrideExt || path.extname(originalName)).toLowerCase();
  const isImage = ALLOWED_IMAGE_EXT.has(ext);
  const isAudio = ALLOWED_AUDIO_EXT.has(ext);

  if (!isImage && !isAudio) {
    throw new Error(`Format file tidak didukung: ${ext}`);
  }

  const mediaType: 'IMAGE' | 'AUDIO' = isImage ? 'IMAGE' : 'AUDIO';
  const limits = getMediaSizeLimits();
  if (mediaType === 'IMAGE' && buffer.length > limits.maxImageBytes) {
    throw new Error(`Ukuran gambar melebihi batas maksimal ${Math.round(limits.maxImageBytes / 1024 / 1024)} MB.`);
  }
  if (mediaType === 'AUDIO' && buffer.length > limits.maxAudioBytes) {
    throw new Error(`Ukuran audio melebihi batas maksimal ${Math.round(limits.maxAudioBytes / 1024 / 1024)} MB.`);
  }

  if (!validateMagicBytes(buffer, ext)) {
    throw new Error(`Konten file tidak sesuai dengan ekstensi ${ext} (validasi signature gagal).`);
  }

  const folder = mediaType === 'IMAGE' ? 'images' : 'audio';
  const targetDir = path.resolve(process.cwd(), 'server', 'storage', folder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const prefix = mediaType === 'IMAGE' ? 'img' : 'aud';
  const uniqueName = `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
  const storagePath = path.join('server', 'storage', folder, uniqueName);
  fs.writeFileSync(path.resolve(process.cwd(), storagePath), buffer);

  return { filename: uniqueName, storagePath, mediaType, ext };
}

export const mediaUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024, // Hard ceiling 30MB; per-type limit enforced in saveMediaBufferToDisk
  },
});

export const importUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // Allow ZIP packages with DOCX + audio up to 50MB
  },
});
