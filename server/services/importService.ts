import path from 'node:path';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getDb } from '../database/db.ts';
import {
  ALLOWED_AUDIO_EXT,
  ALLOWED_IMAGE_EXT,
  saveMediaBufferToDisk,
} from '../middleware/upload.ts';
import type { QuestionType } from './gradingService.ts';

export interface ParsedOption {
  optionKey: string;
  optionText: string;
  isCorrect: boolean;
  imageFilename?: string;
  audioFilename?: string;
  imageMediaId?: number;
  audioMediaId?: number;
}

export interface ParsedMatchingPair {
  pairKey: string;
  leftText: string;
  rightKey: string;
  rightText: string;
  score: number;
  leftImageMediaId?: number;
  leftAudioMediaId?: number;
  rightImageMediaId?: number;
  rightAudioMediaId?: number;
}

export interface ParsedMediaRef {
  mediaId: number;
  mediaType: 'IMAGE' | 'AUDIO';
  originalName: string;
  placement: 'MAIN_QUESTION' | 'INSTRUCTIONS' | 'STATEMENT' | 'SUPPORTING_MATERIAL';
}

export interface ParsedImportQuestion {
  tempId: string;
  number: number;
  subjectName: string;
  className: string;
  questionType: QuestionType;
  questionText: string;
  instructions: string;
  defaultScore: number;
  partialCredit: boolean;
  rubricText: string;
  options: ParsedOption[];
  matchingPairs: ParsedMatchingPair[];
  correctAnswer: Record<string, unknown>;
  questionImageName?: string;
  questionAudioName?: string;
  mediaRefs: ParsedMediaRef[];
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
}

export interface ImportPreviewResult {
  questions: ParsedImportQuestion[];
  extractedMedia: Array<{
    mediaId: number;
    originalName: string;
    mediaType: 'IMAGE' | 'AUDIO';
    mimeType: string;
  }>;
  summary: {
    totalParsed: number;
    validCount: number;
    errorCount: number;
    warningCount: number;
    duplicateCount: number;
    extractedImages: number;
    mappedAudio: number;
  };
  globalErrors: string[];
}

function normalizeQuestionType(raw: string): QuestionType | null {
  const s = raw.trim().toUpperCase().replace(/[\s/-]+/g, '_');
  if (s === 'MULTIPLE_CHOICE' || s === 'PG' || s === 'PILIHAN_GANDA' || s === 'MC') {
    return 'MULTIPLE_CHOICE';
  }
  if (s === 'MULTIPLE_SELECT' || s === 'PGK' || s === 'PILIHAN_GANDA_KOMPLEKS' || s === 'MS' || s === 'CHECKBOX') {
    return 'MULTIPLE_SELECT';
  }
  if (s === 'MATCHING' || s === 'MENJODOHKAN' || s === 'MATCH') {
    return 'MATCHING';
  }
  if (s === 'TRUE_FALSE' || s === 'BENAR_SALAH' || s === 'TF' || s === 'TRUEFALSE') {
    return 'TRUE_FALSE';
  }
  if (s === 'ESSAY' || s === 'ESAI' || s === 'URAIAN') {
    return 'ESSAY';
  }
  return null;
}

function lookupMediaByName(
  filename: string | undefined,
  expectedType: 'IMAGE' | 'AUDIO',
  uploadedMap: Map<string, { mediaId: number; mediaType: 'IMAGE' | 'AUDIO'; originalName: string }>
): { mediaId?: number; warning?: string; error?: string } {
  if (!filename || !filename.trim()) return {};
  const clean = path.basename(filename.trim()).toLowerCase();
  const ext = path.extname(clean);

  if (expectedType === 'IMAGE' && !ALLOWED_IMAGE_EXT.has(ext)) {
    return { error: `Format gambar tidak didukung untuk "${filename}". Gunakan JPG, JPEG, PNG, atau WEBP.` };
  }
  if (expectedType === 'AUDIO' && !ALLOWED_AUDIO_EXT.has(ext)) {
    return { error: `Format audio tidak didukung untuk "${filename}". Gunakan MP3, WAV, M4A, atau OGG.` };
  }

  const fromBatch = uploadedMap.get(clean);
  if (fromBatch && fromBatch.mediaType === expectedType) {
    return { mediaId: fromBatch.mediaId };
  }

  const db = getDb();
  const existing = db
    .prepare(`SELECT id, media_type FROM media_files WHERE LOWER(original_name) = ? OR LOWER(filename) = ? ORDER BY id DESC LIMIT 1`)
    .get(clean, clean) as { id: number; media_type: string } | undefined;

  if (existing && existing.media_type === expectedType) {
    return { mediaId: existing.id };
  }

  return {
    warning: `File media "${filename}" belum ditemukan di paket atau Media Library.`,
  };
}

function checkDuplicateInDb(questionText: string, subjectId?: number): boolean {
  if (!questionText.trim()) return false;
  const db = getDb();
  const normalized = questionText.trim().toLowerCase();
  if (subjectId) {
    const row = db
      .prepare(`SELECT id FROM questions WHERE LOWER(TRIM(question_text)) = ? AND subject_id = ? LIMIT 1`)
      .get(normalized, subjectId);
    return Boolean(row);
  }
  const row = db
    .prepare(`SELECT id FROM questions WHERE LOWER(TRIM(question_text)) = ? LIMIT 1`)
    .get(normalized);
  return Boolean(row);
}

export function validateParsedQuestions(
  questions: ParsedImportQuestion[],
  targetSubjectId?: number
): void {
  const seenTexts = new Set<string>();

  for (const q of questions) {
    const errs = q.errors;
    const warns = q.warnings;

    if (!q.questionText || !q.questionText.trim()) {
      errs.push('Teks pertanyaan wajib diisi.');
    }

    const normText = q.questionText.trim().toLowerCase();
    if (normText) {
      if (seenTexts.has(normText) || checkDuplicateInDb(q.questionText, targetSubjectId)) {
        q.isDuplicate = true;
        warns.push('Pertanyaan terdeteksi duplikat dengan soal di baris lain atau Bank Soal.');
      }
      seenTexts.add(normText);
    }

    if (!q.defaultScore || q.defaultScore <= 0) {
      q.defaultScore = 10;
      warns.push('Skor tidak valid atau kosong, diset ke default 10.');
    }

    if (q.questionType === 'MULTIPLE_CHOICE') {
      if (q.options.length < 2) {
        errs.push('Pilihan Ganda minimal memiliki 2 opsi (misal A dan B).');
      }
      const correctKey = String(q.correctAnswer.correctKey || '').toUpperCase();
      if (!correctKey || !q.options.some((o) => o.optionKey === correctKey)) {
        errs.push(`Kunci jawaban Pilihan Ganda "${correctKey || '(kosong)'}" tidak cocok dengan opsi yang tersedia.`);
      }
    } else if (q.questionType === 'MULTIPLE_SELECT') {
      if (q.options.length < 2) {
        errs.push('Pilihan Ganda Kompleks minimal memiliki 2 opsi.');
      }
      const keys = Array.isArray(q.correctAnswer.correctKeys)
        ? (q.correctAnswer.correctKeys as string[]).map((k) => k.toUpperCase())
        : [];
      if (keys.length === 0) {
        errs.push('Pilihan Ganda Kompleks harus memiliki minimal 1 kunci jawaban.');
      } else {
        for (const k of keys) {
          if (!q.options.some((o) => o.optionKey === k)) {
            errs.push(`Kunci jawaban "${k}" tidak ditemukan pada opsi yang tersedia.`);
          }
        }
      }
    } else if (q.questionType === 'TRUE_FALSE') {
      const val = String(q.correctAnswer.correctValue || '').toUpperCase();
      if (val !== 'TRUE' && val !== 'FALSE') {
        errs.push('Kunci jawaban Benar/Salah harus TRUE atau FALSE.');
      }
    } else if (q.questionType === 'MATCHING') {
      if (q.matchingPairs.length < 2) {
        errs.push('Soal Menjodohkan minimal memiliki 2 pasangan.');
      }
      for (const p of q.matchingPairs) {
        if (!p.leftText.trim() || !p.rightText.trim()) {
          errs.push(`Pasangan ${p.pairKey} memiliki Kolom A atau Kolom B yang kosong.`);
        }
      }
    }
  }
}

function parseTabularRows(
  rows: Array<Record<string, unknown>>,
  uploadedMap: Map<string, { mediaId: number; mediaType: 'IMAGE' | 'AUDIO'; originalName: string }>
): ParsedImportQuestion[] {
  const results: ParsedImportQuestion[] = [];

  rows.forEach((rawRow, idx) => {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      row[k.trim().toLowerCase()] = v == null ? '' : String(v).trim();
    }

    const numStr = row['number'] || row['no'] || row['nomor'] || String(idx + 1);
    const num = Number(numStr) || idx + 1;
    const rawType = row['question type'] || row['question_type'] || row['type'] || row['tipe'] || 'MULTIPLE_CHOICE';
    const qType = normalizeQuestionType(rawType);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!qType) {
      errors.push(`Tipe soal tidak dikenal: "${rawType}".`);
    }

    const resolvedType: QuestionType = qType ?? 'MULTIPLE_CHOICE';
    const questionText = row['question'] || row['pertanyaan'] || row['soal'] || '';
    const instructions = row['instructions'] || row['petunjuk'] || '';
    const subjectName = row['subject'] || row['mata pelajaran'] || row['mapel'] || '';
    const className = row['class'] || row['kelas'] || '';
    const score = Number(row['score'] || row['skor'] || '10') || 10;
    const rubricText = row['rubric'] || row['rubrik'] || '';
    const rawAnswer = row['correct answer'] || row['correct_answer'] || row['answer'] || row['answers'] || row['kunci'] || '';

    const mediaRefs: ParsedMediaRef[] = [];
    const qImgName = row['question image'] || row['question_image'] || row['gambar soal'] || '';
    const qAudName = row['question audio'] || row['question_audio'] || row['audio soal'] || '';

    if (qImgName) {
      const m = lookupMediaByName(qImgName, 'IMAGE', uploadedMap);
      if (m.error) errors.push(m.error);
      if (m.warning) warnings.push(m.warning);
      if (m.mediaId) {
        mediaRefs.push({
          mediaId: m.mediaId,
          mediaType: 'IMAGE',
          originalName: qImgName,
          placement: resolvedType === 'TRUE_FALSE' ? 'STATEMENT' : 'MAIN_QUESTION',
        });
      }
    }
    if (qAudName) {
      const m = lookupMediaByName(qAudName, 'AUDIO', uploadedMap);
      if (m.error) errors.push(m.error);
      if (m.warning) warnings.push(m.warning);
      if (m.mediaId) {
        mediaRefs.push({
          mediaId: m.mediaId,
          mediaType: 'AUDIO',
          originalName: qAudName,
          placement: resolvedType === 'TRUE_FALSE' ? 'STATEMENT' : 'MAIN_QUESTION',
        });
      }
    }

    const options: ParsedOption[] = [];
    const matchingPairs: ParsedMatchingPair[] = [];
    let correctAnswer: Record<string, unknown> = {};

    const optImgMapRaw = row['option image'] || row['option_image'] || '';
    const optAudMapRaw = row['option audio'] || row['option_audio'] || '';

    const parseOptMediaMapping = (rawStr: string): Record<string, string> => {
      const map: Record<string, string> = {};
      if (!rawStr) return map;
      for (const part of rawStr.split(/[;|]/)) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf(':');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim().toUpperCase();
          const val = trimmed.slice(eqIdx + 1).trim();
          map[key] = val;
        }
      }
      return map;
    };

    const optImgMap = parseOptMediaMapping(optImgMapRaw);
    const optAudMap = parseOptMediaMapping(optAudMapRaw);

    if (resolvedType === 'MULTIPLE_CHOICE' || resolvedType === 'MULTIPLE_SELECT') {
      const correctKeys = rawAnswer
        .split(/[,;]/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      for (const key of ['A', 'B', 'C', 'D', 'E']) {
        const optText = row[`option ${key.toLowerCase()}`] || row[`option_${key.toLowerCase()}`] || row[`opsi ${key.toLowerCase()}`] || '';
        const optImg = row[`option ${key.toLowerCase()} image`] || row[`option_${key.toLowerCase()}_image`] || optImgMap[key] || '';
        const optAud = row[`option ${key.toLowerCase()} audio`] || row[`option_${key.toLowerCase()}_audio`] || optAudMap[key] || '';

        if (optText || optImg || optAud) {
          const opt: ParsedOption = {
            optionKey: key,
            optionText: optText,
            isCorrect: correctKeys.includes(key),
            imageFilename: optImg || undefined,
            audioFilename: optAud || undefined,
          };
          if (optImg) {
            const m = lookupMediaByName(optImg, 'IMAGE', uploadedMap);
            if (m.error) errors.push(`Opsi ${key}: ${m.error}`);
            if (m.warning) warnings.push(`Opsi ${key}: ${m.warning}`);
            if (m.mediaId) opt.imageMediaId = m.mediaId;
          }
          if (optAud) {
            const m = lookupMediaByName(optAud, 'AUDIO', uploadedMap);
            if (m.error) errors.push(`Opsi ${key}: ${m.error}`);
            if (m.warning) warnings.push(`Opsi ${key}: ${m.warning}`);
            if (m.mediaId) opt.audioMediaId = m.mediaId;
          }
          options.push(opt);
        }
      }

      if (resolvedType === 'MULTIPLE_CHOICE') {
        correctAnswer = { correctKey: correctKeys[0] || '' };
      } else {
        correctAnswer = { correctKeys };
      }
    } else if (resolvedType === 'TRUE_FALSE') {
      const normalizedVal = rawAnswer.toUpperCase() === 'BENAR' || rawAnswer.toUpperCase() === 'TRUE'
        ? 'TRUE'
        : rawAnswer.toUpperCase() === 'SALAH' || rawAnswer.toUpperCase() === 'FALSE'
          ? 'FALSE'
          : rawAnswer.toUpperCase();
      correctAnswer = { correctValue: normalizedVal };
      options.push(
        { optionKey: 'TRUE', optionText: 'BENAR (TRUE)', isCorrect: normalizedVal === 'TRUE' },
        { optionKey: 'FALSE', optionText: 'SALAH (FALSE)', isCorrect: normalizedVal === 'FALSE' }
      );
    } else if (resolvedType === 'MATCHING') {
      // Structured matching pairs column: "1:Left A=B:Right B | 2:Left 2=A:Right A" OR using Option A-E / Matching Pairs column
      const pairsStr = row['matching pairs'] || row['matching_pairs'] || row['pairs'] || '';
      if (pairsStr) {
        const items = pairsStr.split('|').map((s) => s.trim()).filter(Boolean);
        items.forEach((item, pIdx) => {
          const [leftPart, rightPart] = item.split('=').map((s) => s.trim());
          if (leftPart && rightPart) {
            const pk = String(pIdx + 1);
            const rk = String.fromCharCode(65 + pIdx);
            matchingPairs.push({
              pairKey: pk,
              leftText: leftPart.replace(/^\d+[:.]\s*/, ''),
              rightKey: rk,
              rightText: rightPart.replace(/^[A-Z][:.]\s*/i, ''),
              score: Math.round((score / items.length) * 100) / 100,
            });
          }
        });
      } else {
        // Fallback: Option A..E format "Left -> Right"
        ['A', 'B', 'C', 'D', 'E'].forEach((key, pIdx) => {
          const cell = row[`option ${key.toLowerCase()}`] || row[`option_${key.toLowerCase()}`] || '';
          if (cell && (cell.includes('->') || cell.includes('='))) {
            const sep = cell.includes('->') ? '->' : '=';
            const [l, r] = cell.split(sep).map((s) => s.trim());
            matchingPairs.push({
              pairKey: String(pIdx + 1),
              leftText: l,
              rightKey: key,
              rightText: r,
              score: 10,
            });
          }
        });
      }
      const pairMap: Record<string, string> = {};
      for (const p of matchingPairs) {
        pairMap[p.pairKey] = p.rightKey;
      }
      correctAnswer = { pairs: pairMap };
    } else if (resolvedType === 'ESSAY') {
      correctAnswer = { manualGrading: true };
    }

    results.push({
      tempId: `imp_${idx + 1}_${Date.now()}`,
      number: num,
      subjectName,
      className,
      questionType: resolvedType,
      questionText,
      instructions,
      defaultScore: score,
      partialCredit: true,
      rubricText,
      options,
      matchingPairs,
      correctAnswer,
      questionImageName: qImgName || undefined,
      questionAudioName: qAudName || undefined,
      mediaRefs,
      errors,
      warnings,
      isDuplicate: false,
    });
  });

  return results;
}

export function parseExcelImport(
  buffer: Buffer,
  uploadedMap: Map<string, { mediaId: number; mediaType: 'IMAGE' | 'AUDIO'; originalName: string }> = new Map()
): ImportPreviewResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return {
      questions: [],
      extractedMedia: [],
      summary: { totalParsed: 0, validCount: 0, errorCount: 1, warningCount: 0, duplicateCount: 0, extractedImages: 0, mappedAudio: 0 },
      globalErrors: ['File Excel tidak memiliki worksheet.'],
    };
  }
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const questions = parseTabularRows(rows, uploadedMap);
  validateParsedQuestions(questions);

  return buildImportPreviewResult(questions, Array.from(uploadedMap.values()));
}

export function parseCsvImport(
  buffer: Buffer,
  uploadedMap: Map<string, { mediaId: number; mediaType: 'IMAGE' | 'AUDIO'; originalName: string }> = new Map()
): ImportPreviewResult {
  const text = buffer.toString('utf8');
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const globalErrors: string[] = [];
  if (parsed.errors && parsed.errors.length > 0) {
    for (const err of parsed.errors.slice(0, 5)) {
      globalErrors.push(`Baris ${err.row}: ${err.message}`);
    }
  }

  const questions = parseTabularRows(parsed.data, uploadedMap);
  validateParsedQuestions(questions);
  return buildImportPreviewResult(questions, Array.from(uploadedMap.values()), globalErrors);
}

export async function parseWordOrZipImport(
  buffer: Buffer,
  originalFilename: string,
  userId: number
): Promise<ImportPreviewResult> {
  const ext = path.extname(originalFilename).toLowerCase();
  const uploadedMap = new Map<string, { mediaId: number; mediaType: 'IMAGE' | 'AUDIO'; originalName: string; mimeType: string }>();
  const globalErrors: string[] = [];
  let docxBuffer: Buffer | null = null;

  if (ext === '.zip') {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = path.basename(entry.entryName);
      if (entryName.startsWith('.') || entryName.startsWith('__MACOSX')) continue;
      const entryExt = path.extname(entryName).toLowerCase();

      if (entryExt === '.docx' && !docxBuffer) {
        docxBuffer = entry.getData();
      } else if (ALLOWED_AUDIO_EXT.has(entryExt) || ALLOWED_IMAGE_EXT.has(entryExt)) {
        try {
          const data = entry.getData();
          const mime = ALLOWED_AUDIO_EXT.has(entryExt) ? 'application/octet-stream' : 'application/octet-stream';
          const saved = saveMediaBufferToDisk(data, entryName, mime, entryExt);
          const db = getDb();
          const res = db.prepare(
            `INSERT INTO media_files (filename, original_name, media_type, mime_type, size_bytes, storage_path, uploaded_by_user_id, is_shared)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
          ).run(saved.filename, entryName, saved.mediaType, mime, data.length, saved.storagePath, userId);

          uploadedMap.set(entryName.toLowerCase(), {
            mediaId: Number(res.lastInsertRowid),
            mediaType: saved.mediaType,
            originalName: entryName,
            mimeType: mime,
          });
        } catch (err) {
          globalErrors.push(`Gagal memproses media paket "${entryName}": ${(err as Error).message}`);
        }
      }
    }
    if (!docxBuffer) {
      return {
        questions: [],
        extractedMedia: [],
        summary: { totalParsed: 0, validCount: 0, errorCount: 1, warningCount: 0, duplicateCount: 0, extractedImages: 0, mappedAudio: 0 },
        globalErrors: ['Paket ZIP tidak berisi file .docx yang valid.'],
      };
    }
  } else if (ext === '.docx') {
    docxBuffer = buffer;
  } else {
    return {
      questions: [],
      extractedMedia: [],
      summary: { totalParsed: 0, validCount: 0, errorCount: 1, warningCount: 0, duplicateCount: 0, extractedImages: 0, mappedAudio: 0 },
      globalErrors: ['Format file harus .docx atau .zip (berisi .docx + file audio/gambar).'],
    };
  }

  // Extract embedded images via Mammoth convertToHtml with custom image handler
  let embeddedImageCounter = 0;
  const tokenToMediaId = new Map<string, { mediaId: number; originalName: string }>();

  const mammothResult = await mammoth.convertToHtml(
    { buffer: docxBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        embeddedImageCounter += 1;
        const contentType = image.contentType || 'image/png';
        const imgExt =
          contentType === 'image/jpeg'
            ? '.jpg'
            : contentType === 'image/webp'
              ? '.webp'
              : '.png';
        const imgBuffer = await image.readAsBuffer();
        const origName = `docx_image_${embeddedImageCounter}${imgExt}`;
        try {
          const saved = saveMediaBufferToDisk(imgBuffer, origName, contentType, imgExt);
          const db = getDb();
          const res = db
            .prepare(
              `INSERT INTO media_files (filename, original_name, media_type, mime_type, size_bytes, storage_path, uploaded_by_user_id, is_shared)
               VALUES (?, ?, 'IMAGE', ?, ?, ?, ?, 1)`
            )
            .run(saved.filename, origName, contentType, imgBuffer.length, saved.storagePath, userId);

          const mediaId = Number(res.lastInsertRowid);
          const token = `[[KBT_IMG_${mediaId}]]`;
          tokenToMediaId.set(token, { mediaId, originalName: origName });
          uploadedMap.set(origName.toLowerCase(), {
            mediaId,
            mediaType: 'IMAGE',
            originalName: origName,
            mimeType: contentType,
          });
          return { src: token };
        } catch (err) {
          globalErrors.push(`Gambar tersemat #${embeddedImageCounter} tidak valid: ${(err as Error).message}`);
          return { src: '' };
        }
      }),
    }
  );

  // Convert HTML blocks to structured plain lines while preserving [[KBT_IMG_<id>]] tokens
  const html = mammothResult.value;
  const withImgTokens = html.replace(/<img[^>]*src="(\[\[KBT_IMG_\d+\]\])"[^>]*\/?>/gi, '\n$1\n');
  const withBreaks = withImgTokens
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  const decoded = withBreaks
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  const lines = decoded.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const questions = parseStructuredWordLines(lines, tokenToMediaId, uploadedMap);
  validateParsedQuestions(questions);

  return buildImportPreviewResult(
    questions,
    Array.from(uploadedMap.values()).map((m) => ({
      mediaId: m.mediaId,
      mediaType: m.mediaType,
      originalName: m.originalName,
      mimeType: m.mimeType,
    })),
    globalErrors
  );
}

function parseStructuredWordLines(
  lines: string[],
  tokenToMediaId: Map<string, { mediaId: number; originalName: string }>,
  uploadedMap: Map<string, { mediaId: number; mediaType: 'IMAGE' | 'AUDIO'; originalName: string }>
): ParsedImportQuestion[] {
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (/^(QUESTION|SOAL)\s+\d+/i.test(line)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = [line];
    } else if (currentBlock.length > 0) {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const parsedQuestions: ParsedImportQuestion[] = [];

  blocks.forEach((block, idx) => {
    const headerMatch = block[0].match(/^(?:QUESTION|SOAL)\s+(\d+)/i);
    const num = headerMatch ? Number(headerMatch[1]) : idx + 1;
    const paddedNum = String(num).padStart(3, '0');

    let questionType: QuestionType = 'MULTIPLE_CHOICE';
    let defaultScore = 10;
    let instructions = '';
    let rubricText = '';
    const errors: string[] = [];
    const warnings: string[] = [];
    const mediaRefs: ParsedMediaRef[] = [];

    const questionTextParts: string[] = [];
    const options: ParsedOption[] = [];
    const colA: Array<{ key: string; text: string }> = [];
    const colB: Array<{ key: string; text: string }> = [];
    const pairAnswers: Record<string, string> = {};
    let answerRaw = '';

    let mode: 'BODY' | 'COL_A' | 'COL_B' | 'ANSWERS' = 'BODY';

    for (let i = 1; i < block.length; i++) {
      const line = block[i];

      if (/^TYPE\s*:/i.test(line)) {
        const val = line.replace(/^TYPE\s*:/i, '').trim();
        const norm = normalizeQuestionType(val);
        if (norm) questionType = norm;
        else errors.push(`Tipe soal tidak valid: ${val}`);
        continue;
      }
      if (/^SCORE\s*:/i.test(line)) {
        defaultScore = Number(line.replace(/^SCORE\s*:/i, '').trim()) || 10;
        continue;
      }
      if (/^INSTRUCTIONS?\s*:/i.test(line)) {
        instructions = line.replace(/^INSTRUCTIONS?\s*:/i, '').trim();
        continue;
      }
      if (/^RUBRIC\s*:/i.test(line)) {
        rubricText = line.replace(/^RUBRIC\s*:/i, '').trim();
        continue;
      }
      if (/^AUDIO\s*:/i.test(line)) {
        const audName = line.replace(/^AUDIO\s*:/i, '').trim();
        const found = lookupMediaByName(audName, 'AUDIO', uploadedMap);
        if (found.error) errors.push(found.error);
        if (found.warning) warnings.push(found.warning);
        if (found.mediaId) {
          mediaRefs.push({
            mediaId: found.mediaId,
            mediaType: 'AUDIO',
            originalName: audName,
            placement: 'MAIN_QUESTION',
          });
        }
        continue;
      }
      if (/^COLUMN\s+A\s*:?/i.test(line)) {
        mode = 'COL_A';
        continue;
      }
      if (/^COLUMN\s+B\s*:?/i.test(line)) {
        mode = 'COL_B';
        continue;
      }
      if (/^ANSWERS?\s*:/i.test(line)) {
        const inlineAns = line.replace(/^ANSWERS?\s*:/i, '').trim();
        if (inlineAns) {
          answerRaw = inlineAns;
        }
        mode = 'ANSWERS';
        continue;
      }

      // Check for embedded image token
      const imgTokenMatch = line.match(/\[\[KBT_IMG_(\d+)\]\]/);
      if (imgTokenMatch) {
        const token = imgTokenMatch[0];
        const info = tokenToMediaId.get(token);
        if (info) {
          mediaRefs.push({
            mediaId: info.mediaId,
            mediaType: 'IMAGE',
            originalName: info.originalName,
            placement: questionType === 'TRUE_FALSE' ? 'STATEMENT' : 'MAIN_QUESTION',
          });
        }
        const stripped = line.replace(token, '').trim();
        if (!stripped) continue;
      }

      if (mode === 'COL_A') {
        const m = line.match(/^(\d+)[.)]\s*(.+)$/);
        if (m) colA.push({ key: m[1], text: m[2].trim() });
        continue;
      }
      if (mode === 'COL_B') {
        const m = line.match(/^([A-E])[.)]\s*(.+)$/i);
        if (m) colB.push({ key: m[1].toUpperCase(), text: m[2].trim() });
        continue;
      }
      if (mode === 'ANSWERS') {
        const pairMatch = line.match(/^(\d+)\s*[-–:]\s*([A-E])$/i);
        if (pairMatch) {
          pairAnswers[pairMatch[1]] = pairMatch[2].toUpperCase();
        } else if (!answerRaw) {
          answerRaw = line;
        }
        continue;
      }

      // Check option line A. / B. / C. / D. / E.
      const optMatch = line.match(/^([A-E])[.)]\s+(.+)$/);
      if (optMatch && (questionType === 'MULTIPLE_CHOICE' || questionType === 'MULTIPLE_SELECT')) {
        options.push({
          optionKey: optMatch[1].toUpperCase(),
          optionText: optMatch[2].trim(),
          isCorrect: false,
        });
        continue;
      }

      questionTextParts.push(line.replace(/\[\[KBT_IMG_\d+\]\]/g, '').trim());
    }

    // Automatic manifest mapping for ZIP audio files: QUESTION_001.mp3, OPTION_001_A.mp3
    for (const [keyLower, mediaInfo] of uploadedMap.entries()) {
      if (mediaInfo.mediaType !== 'AUDIO') continue;
      const baseNoExt = path.basename(keyLower, path.extname(keyLower)).toUpperCase();
      if (baseNoExt === `QUESTION_${paddedNum}` || baseNoExt === `QUESTION_${num}`) {
        if (!mediaRefs.some((m) => m.mediaId === mediaInfo.mediaId)) {
          mediaRefs.push({
            mediaId: mediaInfo.mediaId,
            mediaType: 'AUDIO',
            originalName: mediaInfo.originalName,
            placement: questionType === 'TRUE_FALSE' ? 'STATEMENT' : 'MAIN_QUESTION',
          });
        }
      }
      const optAudioMatch = baseNoExt.match(new RegExp(`^OPTION_0*${num}_([A-E])$`));
      if (optAudioMatch) {
        const targetOpt = options.find((o) => o.optionKey === optAudioMatch[1]);
        if (targetOpt) {
          targetOpt.audioMediaId = mediaInfo.mediaId;
          targetOpt.audioFilename = mediaInfo.originalName;
        }
      }
    }

    let correctAnswer: Record<string, unknown> = {};
    const matchingPairs: ParsedMatchingPair[] = [];

    if (questionType === 'MULTIPLE_CHOICE') {
      const ck = answerRaw.trim().toUpperCase();
      correctAnswer = { correctKey: ck };
      options.forEach((o) => {
        o.isCorrect = o.optionKey === ck;
      });
    } else if (questionType === 'MULTIPLE_SELECT') {
      const keys = answerRaw.split(/[,;]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      correctAnswer = { correctKeys: keys };
      options.forEach((o) => {
        o.isCorrect = keys.includes(o.optionKey);
      });
    } else if (questionType === 'TRUE_FALSE') {
      const val = answerRaw.trim().toUpperCase();
      correctAnswer = { correctValue: val };
      options.push(
        { optionKey: 'TRUE', optionText: 'BENAR (TRUE)', isCorrect: val === 'TRUE' },
        { optionKey: 'FALSE', optionText: 'SALAH (FALSE)', isCorrect: val === 'FALSE' }
      );
    } else if (questionType === 'MATCHING') {
      const perScore = colA.length > 0 ? Math.round((defaultScore / colA.length) * 100) / 100 : 10;
      const colBMap = new Map(colB.map((b) => [b.key, b.text]));
      for (const a of colA) {
        const targetRightKey = pairAnswers[a.key] || '';
        const targetRightText = colBMap.get(targetRightKey) || '';
        if (!targetRightKey || !targetRightText) {
          errors.push(`Pasangan menjodohkan untuk item ${a.key} tidak valid.`);
        }
        matchingPairs.push({
          pairKey: a.key,
          leftText: a.text,
          rightKey: targetRightKey,
          rightText: targetRightText,
          score: perScore,
        });
      }
      correctAnswer = { pairs: pairAnswers };
    } else if (questionType === 'ESSAY') {
      correctAnswer = { manualGrading: true };
    }

    parsedQuestions.push({
      tempId: `doc_${idx + 1}_${Date.now()}`,
      number: num,
      subjectName: '',
      className: '',
      questionType,
      questionText: questionTextParts.filter(Boolean).join('\n'),
      instructions,
      defaultScore,
      partialCredit: true,
      rubricText,
      options,
      matchingPairs,
      correctAnswer,
      mediaRefs,
      errors,
      warnings,
      isDuplicate: false,
    });
  });

  return parsedQuestions;
}

function buildImportPreviewResult(
  questions: ParsedImportQuestion[],
  extractedMedia: Array<{ mediaId: number; originalName: string; mediaType: 'IMAGE' | 'AUDIO'; mimeType?: string }>,
  globalErrors: string[] = []
): ImportPreviewResult {
  let validCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  let duplicateCount = 0;

  for (const q of questions) {
    if (q.errors.length === 0) validCount += 1;
    else errorCount += 1;
    if (q.warnings.length > 0) warningCount += 1;
    if (q.isDuplicate) duplicateCount += 1;
  }

  return {
    questions,
    extractedMedia: extractedMedia.map((m) => ({
      mediaId: m.mediaId,
      originalName: m.originalName,
      mediaType: m.mediaType,
      mimeType: m.mimeType || 'application/octet-stream',
    })),
    summary: {
      totalParsed: questions.length,
      validCount,
      errorCount,
      warningCount,
      duplicateCount,
      extractedImages: extractedMedia.filter((m) => m.mediaType === 'IMAGE').length,
      mappedAudio: extractedMedia.filter((m) => m.mediaType === 'AUDIO').length,
    },
    globalErrors,
  };
}

export function generateTemplateWorkbook(): Buffer {
  const rows = [
    {
      Number: 1,
      Subject: 'Bahasa Inggris',
      Class: 'VIII-A',
      'Question Type': 'MULTIPLE_CHOICE',
      Question: 'What is the past form of GO?',
      'Option A': 'Goes',
      'Option B': 'Went',
      'Option C': 'Gone',
      'Option D': 'Going',
      'Option E': '',
      'Correct Answer': 'B',
      Score: 10,
      'Question Image': '',
      'Question Audio': '',
      'Option Image': '',
      'Option Audio': '',
      'Matching Pairs': '',
    },
    {
      Number: 2,
      Subject: 'Bahasa Inggris',
      Class: 'VIII-A',
      'Question Type': 'MULTIPLE_SELECT',
      Question: 'Which are fruits?',
      'Option A': 'Apple',
      'Option B': 'Carrot',
      'Option C': 'Banana',
      'Option D': 'Potato',
      'Option E': '',
      'Correct Answer': 'A, C',
      Score: 10,
      'Question Image': '',
      'Question Audio': '',
      'Option Image': '',
      'Option Audio': '',
      'Matching Pairs': '',
    },
    {
      Number: 3,
      Subject: 'Bahasa Inggris',
      Class: 'VIII-A',
      'Question Type': 'TRUE_FALSE',
      Question: 'The past form of GO is WENT.',
      'Option A': '',
      'Option B': '',
      'Option C': '',
      'Option D': '',
      'Option E': '',
      'Correct Answer': 'TRUE',
      Score: 10,
      'Question Image': '',
      'Question Audio': '',
      'Option Image': '',
      'Option Audio': '',
      'Matching Pairs': '',
    },
    {
      Number: 4,
      Subject: 'Bahasa Inggris',
      Class: 'VIII-A',
      'Question Type': 'MATCHING',
      Question: 'Match each item in Column A with Column B.',
      'Option A': '',
      'Option B': '',
      'Option C': '',
      'Option D': '',
      'Option E': '',
      'Correct Answer': '1-A; 2-B; 3-C',
      Score: 30,
      'Question Image': '',
      'Question Audio': '',
      'Option Image': '',
      'Option Audio': '',
      'Matching Pairs': '1:Capital of Indonesia=A:Jakarta | 2:Past form of GO=B:Went | 3:Opposite of BIG=C:Small',
    },
    {
      Number: 5,
      Subject: 'Bahasa Inggris',
      Class: 'VIII-A',
      'Question Type': 'ESSAY',
      Question: 'Explain why learning English is important.',
      'Option A': '',
      'Option B': '',
      'Option C': '',
      'Option D': '',
      'Option E': '',
      'Correct Answer': 'MANUAL GRADING',
      Score: 20,
      'Question Image': '',
      'Question Audio': '',
      'Option Image': '',
      'Option Audio': '',
      'Matching Pairs': '',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function generateTemplateCsv(): string {
  const wb = XLSX.read(generateTemplateWorkbook(), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(ws);
}

export function generateTemplateDocx(): Buffer {
  const paragraphs = [
    'QUESTION 1',
    'TYPE: MULTIPLE CHOICE',
    'SCORE: 10',
    'What is the past form of GO?',
    'A. Goes',
    'B. Went',
    'C. Gone',
    'D. Going',
    'ANSWER: B',
    '',
    'QUESTION 2',
    'TYPE: MULTIPLE SELECT',
    'SCORE: 10',
    'Which are fruits?',
    'A. Apple',
    'B. Carrot',
    'C. Banana',
    'D. Potato',
    'ANSWERS: A, C',
    '',
    'QUESTION 3',
    'TYPE: TRUE FALSE',
    'SCORE: 10',
    'The past form of GO is WENT.',
    'ANSWER: TRUE',
    '',
    'QUESTION 4',
    'TYPE: MATCHING',
    'SCORE: 30',
    'Match Column A with Column B.',
    'COLUMN A:',
    '1. Capital of Indonesia.',
    '2. Past form of GO.',
    '3. Opposite of BIG.',
    'COLUMN B:',
    'A. Small.',
    'B. Jakarta.',
    'C. Went.',
    'ANSWERS:',
    '1-B',
    '2-C',
    '3-A',
    '',
    'QUESTION 5',
    'TYPE: ESSAY',
    'SCORE: 20',
    'Explain why learning English is important.',
    'ANSWER: MANUAL GRADING.',
  ];

  const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const bodyXml = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`)
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}<w:sectPr/></w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(relsXml, 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
  return zip.toBuffer();
}
