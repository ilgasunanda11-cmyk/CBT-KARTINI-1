import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { getDb } from '../database/db.ts';
import { recordAuditLog, requireTeacherOrAdmin } from '../middleware/auth.ts';
import { mediaUploadMulter, saveMediaBufferToDisk } from '../middleware/upload.ts';

const router = express.Router();

// Upload single or multiple media files (image/audio)
router.post('/upload', requireTeacherOrAdmin, mediaUploadMulter.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
    return;
  }

  try {
    const saved = saveMediaBufferToDisk(req.file.buffer, req.file.originalname, req.file.mimetype);
    const { caption, alt_text, duration_seconds, is_shared } = req.body as {
      caption?: string;
      alt_text?: string;
      duration_seconds?: string;
      is_shared?: string;
    };

    const db = getDb();
    const resDb = db
      .prepare(
        `INSERT INTO media_files (
           filename, original_name, media_type, mime_type, size_bytes,
           storage_path, duration_seconds, alt_text, caption, uploaded_by_user_id, is_shared
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        saved.filename,
        req.file.originalname,
        saved.mediaType,
        req.file.mimetype,
        req.file.size,
        saved.storagePath,
        Number(duration_seconds || 0),
        (alt_text || '').trim(),
        (caption || '').trim(),
        req.user!.id,
        is_shared === '0' ? 0 : 1
      );

    const mediaId = Number(resDb.lastInsertRowid);
    const media = db.prepare(`SELECT * FROM media_files WHERE id = ?`).get(mediaId);

    recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      role: req.user!.role,
      action: 'UPLOAD_MEDIA',
      resourceType: 'media_files',
      resourceId: mediaId,
      details: { originalName: req.file.originalname, mediaType: saved.mediaType, size: req.file.size },
      ipAddress: req.ip,
    });

    res.status(201).json({ media });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// List media in Media Library
router.get('/', requireTeacherOrAdmin, (req, res) => {
  const db = getDb();
  const typeFilter = req.query.type ? String(req.query.type).toUpperCase() : null;
  const search = req.query.search ? `%${String(req.query.search).trim()}%` : null;

  let sql = `
    SELECT m.*, u.full_name as uploader_name,
      (
        (SELECT COUNT(*) FROM question_media qm WHERE qm.media_id = m.id) +
        (SELECT COUNT(*) FROM option_media om WHERE om.media_id = m.id)
      ) as usage_count
    FROM media_files m
    LEFT JOIN users u ON u.id = m.uploaded_by_user_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (req.user!.role !== 'ADMIN') {
    sql += ` AND (m.uploaded_by_user_id = ? OR m.is_shared = 1)`;
    params.push(req.user!.id);
  }
  if (typeFilter === 'IMAGE' || typeFilter === 'AUDIO') {
    sql += ` AND m.media_type = ?`;
    params.push(typeFilter);
  }
  if (search) {
    sql += ` AND (m.original_name LIKE ? OR m.caption LIKE ? OR m.alt_text LIKE ?)`;
    params.push(search, search, search);
  }
  sql += ` ORDER BY m.created_at DESC, m.id DESC`;

  const media = db.prepare(sql).all(...params);
  res.json({ media });
});

// Stream actual file bytes (used by Question Editor, Media Library, and Student Exam Interface)
router.get('/file/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const row = db.prepare(`SELECT * FROM media_files WHERE id = ?`).get(id) as
    | { id: number; storage_path: string; mime_type: string; filename: string }
    | undefined;

  if (!row) {
    res.status(404).json({ error: 'Media tidak ditemukan.' });
    return;
  }

  const absPath = path.resolve(process.cwd(), row.storage_path);
  if (!fs.existsSync(absPath)) {
    res.status(404).json({ error: 'File media fisik tidak ditemukan di penyimpanan.' });
    return;
  }

  const stat = fs.statSync(absPath);
  const ext = path.extname(row.filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
  };
  const contentType = mimeMap[ext] || row.mime_type || 'application/octet-stream';

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    });
    fs.createReadStream(absPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    });
    fs.createReadStream(absPath).pipe(res);
  }
});

// Get single media metadata + usage details
router.get('/:id', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const media = db.prepare(`SELECT * FROM media_files WHERE id = ?`).get(id) as
    | { id: number; uploaded_by_user_id: number; is_shared: number }
    | undefined;
  if (!media) {
    res.status(404).json({ error: 'Media tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && media.uploaded_by_user_id !== req.user!.id && media.is_shared !== 1) {
    res.status(403).json({ error: 'Tidak memiliki akses ke media ini.' });
    return;
  }

  const questionUsages = db
    .prepare(
      `SELECT q.id, q.question_text, q.question_type, qm.placement
       FROM question_media qm
       JOIN questions q ON q.id = qm.question_id
       WHERE qm.media_id = ?`
    )
    .all(id);

  const optionUsages = db
    .prepare(
      `SELECT q.id, q.question_text, q.question_type, om.matching_side
       FROM option_media om
       JOIN questions q ON q.id = om.question_id
       WHERE om.media_id = ?`
    )
    .all(id);

  res.json({ media, usages: { questionUsages, optionUsages } });
});

// Update metadata or replace binary file
router.put('/:id', requireTeacherOrAdmin, mediaUploadMulter.single('file'), (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM media_files WHERE id = ?`).get(id) as
    | {
        id: number;
        uploaded_by_user_id: number;
        storage_path: string;
        media_type: string;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Media tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && existing.uploaded_by_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda hanya dapat mengubah media yang Anda unggah.' });
    return;
  }

  const { caption, alt_text, is_shared } = req.body as {
    caption?: string;
    alt_text?: string;
    is_shared?: string;
  };

  if (req.file) {
    try {
      const saved = saveMediaBufferToDisk(req.file.buffer, req.file.originalname, req.file.mimetype);
      if (saved.mediaType !== existing.media_type) {
        res.status(400).json({ error: `Media pengganti harus bertipe ${existing.media_type}.` });
        return;
      }
      const oldAbsPath = path.resolve(process.cwd(), existing.storage_path);
      if (fs.existsSync(oldAbsPath)) {
        fs.unlinkSync(oldAbsPath);
      }
      db.prepare(
        `UPDATE media_files SET
           filename = ?, original_name = ?, mime_type = ?, size_bytes = ?, storage_path = ?,
           caption = COALESCE(?, caption), alt_text = COALESCE(?, alt_text),
           updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        saved.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        saved.storagePath,
        caption?.trim() ?? null,
        alt_text?.trim() ?? null,
        id
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
  } else {
    db.prepare(
      `UPDATE media_files SET
         caption = COALESCE(?, caption),
         alt_text = COALESCE(?, alt_text),
         is_shared = COALESCE(?, is_shared),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      caption?.trim() ?? null,
      alt_text?.trim() ?? null,
      is_shared !== undefined ? (is_shared === '0' || is_shared === 'false' ? 0 : 1) : null,
      id
    );
  }

  const updated = db.prepare(`SELECT * FROM media_files WHERE id = ?`).get(id);
  res.json({ media: updated });
});

// Delete unused media file
router.delete('/:id', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM media_files WHERE id = ?`).get(id) as
    | { id: number; uploaded_by_user_id: number; storage_path: string; original_name: string }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Media tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && existing.uploaded_by_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda hanya dapat menghapus media milik Anda sendiri.' });
    return;
  }

  const qUsage = (db.prepare(`SELECT COUNT(*) as c FROM question_media WHERE media_id = ?`).get(id) as { c: number }).c;
  const oUsage = (db.prepare(`SELECT COUNT(*) as c FROM option_media WHERE media_id = ?`).get(id) as { c: number }).c;
  if (qUsage + oUsage > 0) {
    res.status(409).json({
      error: `Media masih digunakan oleh ${qUsage + oUsage} bagian soal. Lepas media dari soal terlebih dahulu sebelum menghapus.`,
    });
    return;
  }

  db.prepare(`DELETE FROM media_files WHERE id = ?`).run(id);
  const absPath = path.resolve(process.cwd(), existing.storage_path);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'DELETE_MEDIA',
    resourceType: 'media_files',
    resourceId: id,
    details: { originalName: existing.original_name },
    ipAddress: req.ip,
  });

  res.json({ success: true });
});

export default router;
