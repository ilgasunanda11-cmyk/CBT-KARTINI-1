import path from 'node:path';
import express from 'express';
import { getDb } from '../database/db.ts';
import { recordAuditLog, requireTeacherOrAdmin } from '../middleware/auth.ts';
import { importUploadMulter, saveMediaBufferToDisk } from '../middleware/upload.ts';
import {
  type ParsedImportQuestion,
  generateTemplateCsv,
  generateTemplateDocx,
  generateTemplateWorkbook,
  parseCsvImport,
  parseExcelImport,
  parseWordOrZipImport,
  validateParsedQuestions,
} from '../services/importService.ts';

const router = express.Router();

// Download official import templates
router.get('/template/:format', requireTeacherOrAdmin, (req, res) => {
  const format = String(req.params.format).toLowerCase();
  if (format === 'xlsx' || format === 'excel') {
    const buf = generateTemplateWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="KARTINI_CBT_Template_Soal.xlsx"');
    res.send(buf);
    return;
  }
  if (format === 'csv') {
    const csv = generateTemplateCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="KARTINI_CBT_Template_Soal.csv"');
    res.send(csv);
    return;
  }
  if (format === 'docx' || format === 'word') {
    const buf = generateTemplateDocx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="KARTINI_CBT_Template_Soal.docx"');
    res.send(buf);
    return;
  }
  res.status(400).json({ error: 'Format template harus xlsx, csv, atau docx.' });
});

function processExtraMediaFiles(
  files: Express.Multer.File[] | undefined,
  userId: number
): Map<string, { mediaId: number; mediaType: 'IMAGE' | 'AUDIO'; originalName: string; mimeType: string }> {
  const map = new Map<string, { mediaId: number; mediaType: 'IMAGE' | 'AUDIO'; originalName: string; mimeType: string }>();
  if (!files || files.length === 0) return map;
  const db = getDb();

  for (const f of files) {
    try {
      const saved = saveMediaBufferToDisk(f.buffer, f.originalname, f.mimetype);
      const res = db
        .prepare(
          `INSERT INTO media_files (filename, original_name, media_type, mime_type, size_bytes, storage_path, uploaded_by_user_id, is_shared)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
        )
        .run(saved.filename, f.originalname, saved.mediaType, f.mimetype, f.size, saved.storagePath, userId);

      map.set(f.originalname.toLowerCase(), {
        mediaId: Number(res.lastInsertRowid),
        mediaType: saved.mediaType,
        originalName: f.originalname,
        mimeType: f.mimetype,
      });
    } catch {
      // Invalid individual media file is surfaced via lookupMediaByName
    }
  }
  return map;
}

const importFields = importUploadMulter.fields([
  { name: 'file', maxCount: 1 },
  { name: 'mediaFiles', maxCount: 50 },
]);

router.post('/excel', requireTeacherOrAdmin, importFields, (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const mainFile = files?.file?.[0];
  if (!mainFile) {
    res.status(400).json({ error: 'File Excel (.xlsx) wajib diunggah.' });
    return;
  }
  const uploadedMap = processExtraMediaFiles(files?.mediaFiles, req.user!.id);
  const preview = parseExcelImport(mainFile.buffer, uploadedMap);
  res.json(preview);
});

router.post('/csv', requireTeacherOrAdmin, importFields, (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const mainFile = files?.file?.[0];
  if (!mainFile) {
    res.status(400).json({ error: 'File CSV (.csv) wajib diunggah.' });
    return;
  }
  const uploadedMap = processExtraMediaFiles(files?.mediaFiles, req.user!.id);
  const preview = parseCsvImport(mainFile.buffer, uploadedMap);
  res.json(preview);
});

router.post('/word', requireTeacherOrAdmin, importFields, async (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const mainFile = files?.file?.[0];
  if (!mainFile) {
    res.status(400).json({ error: 'File Word (.docx) atau paket ZIP (.zip) wajib diunggah.' });
    return;
  }
  try {
    const extraMedia = processExtraMediaFiles(files?.mediaFiles, req.user!.id);
    const preview = await parseWordOrZipImport(mainFile.buffer, mainFile.originalname, req.user!.id);

    // Also allow mapping separately uploaded audio files to Word questions
    if (extraMedia.size > 0) {
      for (const q of preview.questions) {
        const padded = String(q.number).padStart(3, '0');
        for (const [nameLower, info] of extraMedia.entries()) {
          if (info.mediaType !== 'AUDIO') continue;
          const base = path.basename(nameLower, path.extname(nameLower)).toUpperCase();
          if (base === `QUESTION_${padded}` || base === `QUESTION_${q.number}`) {
            if (!q.mediaRefs.some((m) => m.mediaId === info.mediaId)) {
              q.mediaRefs.push({
                mediaId: info.mediaId,
                mediaType: 'AUDIO',
                originalName: info.originalName,
                placement: q.questionType === 'TRUE_FALSE' ? 'STATEMENT' : 'MAIN_QUESTION',
              });
            }
          }
          const optMatch = base.match(new RegExp(`^OPTION_0*${q.number}_([A-E])$`));
          if (optMatch) {
            const target = q.options.find((o) => o.optionKey === optMatch[1]);
            if (target) {
              target.audioMediaId = info.mediaId;
              target.audioFilename = info.originalName;
            }
          }
        }
      }
      preview.summary.mappedAudio += Array.from(extraMedia.values()).filter((m) => m.mediaType === 'AUDIO').length;
    }

    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: `Gagal memproses file Word: ${(err as Error).message}` });
  }
});

// Unified preview/re-validate endpoint (when user edits parsed questions before confirming)
router.post('/preview', requireTeacherOrAdmin, (req, res) => {
  const { questions, subjectId } = req.body as {
    questions: ParsedImportQuestion[];
    subjectId?: number;
  };
  if (!Array.isArray(questions)) {
    res.status(400).json({ error: 'Format data pratinjau tidak valid.' });
    return;
  }
  for (const q of questions) {
    q.errors = [];
    q.warnings = [];
    q.isDuplicate = false;
  }
  validateParsedQuestions(questions, subjectId ? Number(subjectId) : undefined);

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

  res.json({
    questions,
    summary: {
      totalParsed: questions.length,
      validCount,
      errorCount,
      warningCount,
      duplicateCount,
    },
  });
});

// Confirm and commit validated questions into the Question Bank
router.post('/confirm', requireTeacherOrAdmin, (req, res) => {
  const { bankId, subjectId, classId, questions, skipInvalid } = req.body as {
    bankId: number;
    subjectId: number;
    classId?: number | null;
    questions: ParsedImportQuestion[];
    skipInvalid?: boolean;
  };

  if (!bankId || !subjectId || !Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'Bank soal, mata pelajaran, dan daftar soal wajib disediakan.' });
    return;
  }

  for (const q of questions) {
    q.errors = [];
    q.warnings = [];
    q.isDuplicate = false;
  }
  validateParsedQuestions(questions, Number(subjectId));

  const validQuestions = questions.filter((q) => q.errors.length === 0);
  if (!skipInvalid && validQuestions.length !== questions.length) {
    res.status(400).json({
      error: `Terdapat ${questions.length - validQuestions.length} soal dengan kesalahan validasi. Perbaiki terlebih dahulu atau aktifkan lewati soal tidak valid.`,
      questions,
    });
    return;
  }
  if (validQuestions.length === 0) {
    res.status(400).json({ error: 'Tidak ada soal valid yang dapat diimpor.' });
    return;
  }

  const db = getDb();
  const insertedIds: number[] = [];

  db.transaction(() => {
    const insQ = db.prepare(
      `INSERT INTO questions (
         bank_id, subject_id, class_id, created_by_user_id, question_type,
         question_text, instructions, correct_answer_json, partial_credit, default_score, rubric_text
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insOpt = db.prepare(
      `INSERT INTO question_options (question_id, option_key, option_text, is_correct, sort_order) VALUES (?, ?, ?, ?, ?)`
    );
    const insPair = db.prepare(
      `INSERT INTO matching_pairs (question_id, pair_key, left_text, right_key, right_text, score, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insQMedia = db.prepare(
      `INSERT INTO question_media (question_id, media_id, placement, sort_order) VALUES (?, ?, ?, ?)`
    );
    const insOptMedia = db.prepare(
      `INSERT INTO option_media (question_id, option_id, media_id, sort_order) VALUES (?, ?, ?, ?)`
    );

    for (const q of validQuestions) {
      const r = insQ.run(
        Number(bankId),
        Number(subjectId),
        classId ? Number(classId) : null,
        req.user!.id,
        q.questionType,
        q.questionText.trim(),
        (q.instructions || '').trim(),
        JSON.stringify(q.correctAnswer || {}),
        q.partialCredit === false ? 0 : 1,
        Number(q.defaultScore || 10),
        (q.rubricText || '').trim()
      );
      const qid = Number(r.lastInsertRowid);
      insertedIds.push(qid);

      if (Array.isArray(q.mediaRefs)) {
        q.mediaRefs.forEach((m, mIdx) => {
          insQMedia.run(qid, m.mediaId, m.placement || 'MAIN_QUESTION', mIdx);
        });
      }

      if (Array.isArray(q.options)) {
        q.options.forEach((opt, oIdx) => {
          const oRes = insOpt.run(qid, opt.optionKey, opt.optionText || '', opt.isCorrect ? 1 : 0, oIdx);
          const optId = Number(oRes.lastInsertRowid);
          if (opt.imageMediaId) insOptMedia.run(qid, optId, opt.imageMediaId, 0);
          if (opt.audioMediaId) insOptMedia.run(qid, optId, opt.audioMediaId, 1);
        });
      }

      if (Array.isArray(q.matchingPairs)) {
        q.matchingPairs.forEach((p, pIdx) => {
          insPair.run(qid, p.pairKey, p.leftText, p.rightKey, p.rightText, p.score || 10, pIdx);
        });
      }
    }
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'IMPORT_QUESTIONS_CONFIRMED',
    resourceType: 'questions',
    details: { bankId, importedCount: insertedIds.length },
    ipAddress: req.ip,
  });

  res.status(201).json({ importedCount: insertedIds.length, insertedIds });
});

export default router;
