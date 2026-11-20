import express from 'express';
import { getDb } from '../database/db.ts';
import { recordAuditLog, requireTeacherOrAdmin } from '../middleware/auth.ts';

const router = express.Router();

export function hydrateQuestion(questionRow: Record<string, unknown>): Record<string, unknown> & {
  options: Array<Record<string, unknown> & { media: Array<Record<string, unknown>> }>;
  matching_pairs: Array<
    Record<string, unknown> & {
      left_media: Array<Record<string, unknown>>;
      right_media: Array<Record<string, unknown>>;
    }
  >;
  media: unknown[];
} {
  const db = getDb();
  const qid = Number(questionRow.id);

  const options = db
    .prepare(`SELECT * FROM question_options WHERE question_id = ? ORDER BY sort_order ASC, id ASC`)
    .all(qid) as Array<Record<string, unknown>>;

  const matchingPairs = db
    .prepare(`SELECT * FROM matching_pairs WHERE question_id = ? ORDER BY sort_order ASC, id ASC`)
    .all(qid) as Array<Record<string, unknown>>;

  const questionMedia = db
    .prepare(
      `SELECT qm.*, m.media_type, m.original_name, m.mime_type, m.size_bytes, m.duration_seconds
       FROM question_media qm
       JOIN media_files m ON m.id = qm.media_id
       WHERE qm.question_id = ?
       ORDER BY qm.sort_order ASC, qm.id ASC`
    )
    .all(qid);

  const optionMedia = db
    .prepare(
      `SELECT om.*, m.media_type, m.original_name, m.mime_type, m.size_bytes, m.duration_seconds
       FROM option_media om
       JOIN media_files m ON m.id = om.media_id
       WHERE om.question_id = ?
       ORDER BY om.sort_order ASC, om.id ASC`
    )
    .all(qid) as Array<Record<string, unknown>>;

  const optionsWithMedia = options.map((opt) => ({
    ...opt,
    media: optionMedia.filter((m) => m.option_id === opt.id),
  }));

  const pairsWithMedia = matchingPairs.map((pair) => ({
    ...pair,
    left_media: optionMedia.filter((m) => m.matching_pair_id === pair.id && m.matching_side === 'LEFT'),
    right_media: optionMedia.filter((m) => m.matching_pair_id === pair.id && m.matching_side === 'RIGHT'),
  }));

  return {
    ...questionRow,
    options: optionsWithMedia,
    matching_pairs: pairsWithMedia,
    media: questionMedia,
  };
}

// Question Banks CRUD
router.get('/banks', requireTeacherOrAdmin, (req, res) => {
  const db = getDb();
  const isAdmin = req.user!.role === 'ADMIN';
  let sql = `
    SELECT qb.*, s.name as subject_name, c.name as class_name, u.full_name as owner_name,
      (SELECT COUNT(*) FROM questions q WHERE q.bank_id = qb.id) as question_count
    FROM question_banks qb
    JOIN subjects s ON s.id = qb.subject_id
    LEFT JOIN classes c ON c.id = qb.class_id
    JOIN users u ON u.id = qb.owner_user_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (!isAdmin) {
    sql += ` AND (qb.owner_user_id = ? OR qb.is_shared = 1)`;
    params.push(req.user!.id);
  }
  sql += ` ORDER BY qb.updated_at DESC, qb.id DESC`;
  const banks = db.prepare(sql).all(...params);
  res.json({ banks });
});

router.post('/banks', requireTeacherOrAdmin, (req, res) => {
  const { title, description, subject_id, class_id, is_shared } = req.body as {
    title?: string;
    description?: string;
    subject_id?: number;
    class_id?: number | null;
    is_shared?: boolean;
  };
  if (!title || !subject_id) {
    res.status(400).json({ error: 'Judul bank soal dan mata pelajaran wajib diisi.' });
    return;
  }
  const db = getDb();
  const r = db
    .prepare(
      `INSERT INTO question_banks (title, description, subject_id, class_id, owner_user_id, is_shared)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(title.trim(), (description || '').trim(), Number(subject_id), class_id ? Number(class_id) : null, req.user!.id, is_shared ? 1 : 0);

  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// List Questions with filters
router.get('/', requireTeacherOrAdmin, (req, res) => {
  const db = getDb();
  const isAdmin = req.user!.role === 'ADMIN';
  const { bankId, subjectId, classId, teacherId, type, hasMedia, search } = req.query as Record<string, string | undefined>;

  let sql = `
    SELECT q.*, qb.title as bank_title, s.name as subject_name, c.name as class_name, u.full_name as creator_name
    FROM questions q
    JOIN question_banks qb ON qb.id = q.bank_id
    JOIN subjects s ON s.id = q.subject_id
    LEFT JOIN classes c ON c.id = q.class_id
    JOIN users u ON u.id = q.created_by_user_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (!isAdmin) {
    sql += ` AND (q.created_by_user_id = ? OR qb.is_shared = 1)`;
    params.push(req.user!.id);
  }
  if (bankId) {
    sql += ` AND q.bank_id = ?`;
    params.push(Number(bankId));
  }
  if (subjectId) {
    sql += ` AND q.subject_id = ?`;
    params.push(Number(subjectId));
  }
  if (classId) {
    sql += ` AND q.class_id = ?`;
    params.push(Number(classId));
  }
  if (teacherId) {
    sql += ` AND q.created_by_user_id = ?`;
    params.push(Number(teacherId));
  }
  if (type) {
    sql += ` AND q.question_type = ?`;
    params.push(type.toUpperCase());
  }
  if (hasMedia === 'IMAGE') {
    sql += ` AND (
      EXISTS (SELECT 1 FROM question_media qm JOIN media_files m ON m.id = qm.media_id WHERE qm.question_id = q.id AND m.media_type = 'IMAGE')
      OR EXISTS (SELECT 1 FROM option_media om JOIN media_files m ON m.id = om.media_id WHERE om.question_id = q.id AND m.media_type = 'IMAGE')
    )`;
  } else if (hasMedia === 'AUDIO') {
    sql += ` AND (
      EXISTS (SELECT 1 FROM question_media qm JOIN media_files m ON m.id = qm.media_id WHERE qm.question_id = q.id AND m.media_type = 'AUDIO')
      OR EXISTS (SELECT 1 FROM option_media om JOIN media_files m ON m.id = om.media_id WHERE om.question_id = q.id AND m.media_type = 'AUDIO')
    )`;
  } else if (hasMedia === 'ANY') {
    sql += ` AND (
      EXISTS (SELECT 1 FROM question_media qm WHERE qm.question_id = q.id)
      OR EXISTS (SELECT 1 FROM option_media om WHERE om.question_id = q.id)
    )`;
  }
  if (search && search.trim()) {
    sql += ` AND (q.question_text LIKE ? OR q.instructions LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  sql += ` ORDER BY q.updated_at DESC, q.id DESC`;
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const questions = rows.map(hydrateQuestion);
  res.json({ questions });
});

router.get('/:id', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT q.*, qb.title as bank_title, qb.is_shared, s.name as subject_name, c.name as class_name, u.full_name as creator_name
       FROM questions q
       JOIN question_banks qb ON qb.id = q.bank_id
       JOIN subjects s ON s.id = q.subject_id
       LEFT JOIN classes c ON c.id = q.class_id
       JOIN users u ON u.id = q.created_by_user_id
       WHERE q.id = ?`
    )
    .get(id) as (Record<string, unknown> & { created_by_user_id: number; is_shared: number }) | undefined;

  if (!row) {
    res.status(404).json({ error: 'Soal tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && row.created_by_user_id !== req.user!.id && row.is_shared !== 1) {
    res.status(403).json({ error: 'Anda tidak memiliki akses ke soal ini.' });
    return;
  }

  res.json({ question: hydrateQuestion(row) });
});

interface QuestionPayloadBody {
  bank_id: number;
  subject_id: number;
  class_id?: number | null;
  question_type: 'MULTIPLE_CHOICE' | 'MULTIPLE_SELECT' | 'MATCHING' | 'TRUE_FALSE' | 'ESSAY';
  question_text: string;
  instructions?: string;
  correct_answer_json: Record<string, unknown> | string;
  partial_credit?: boolean | number;
  default_score?: number;
  rubric_text?: string;
  difficulty?: string;
  media?: Array<{
    media_id: number;
    placement: 'MAIN_QUESTION' | 'INSTRUCTIONS' | 'STATEMENT' | 'SUPPORTING_MATERIAL';
    caption?: string;
    alt_text?: string;
    sort_order?: number;
  }>;
  options?: Array<{
    option_key: string;
    option_text: string;
    is_correct: boolean | number;
    sort_order?: number;
    media?: Array<{
      media_id: number;
      caption?: string;
      alt_text?: string;
      sort_order?: number;
    }>;
  }>;
  matching_pairs?: Array<{
    pair_key: string;
    left_text: string;
    right_key: string;
    right_text: string;
    score?: number;
    sort_order?: number;
    left_media?: Array<{ media_id: number; caption?: string; alt_text?: string; sort_order?: number }>;
    right_media?: Array<{ media_id: number; caption?: string; alt_text?: string; sort_order?: number }>;
  }>;
}

function saveQuestionRelations(questionId: number, body: QuestionPayloadBody) {
  const db = getDb();

  db.prepare(`DELETE FROM question_media WHERE question_id = ?`).run(questionId);
  db.prepare(`DELETE FROM option_media WHERE question_id = ?`).run(questionId);
  db.prepare(`DELETE FROM question_options WHERE question_id = ?`).run(questionId);
  db.prepare(`DELETE FROM matching_pairs WHERE question_id = ?`).run(questionId);

  if (Array.isArray(body.media)) {
    const insQMedia = db.prepare(
      `INSERT INTO question_media (question_id, media_id, placement, caption, alt_text, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    body.media.forEach((m, idx) => {
      insQMedia.run(
        questionId,
        Number(m.media_id),
        m.placement || 'MAIN_QUESTION',
        m.caption || '',
        m.alt_text || '',
        m.sort_order ?? idx
      );
    });
  }

  const insOptMedia = db.prepare(
    `INSERT INTO option_media (question_id, option_id, matching_pair_id, matching_side, media_id, caption, alt_text, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  if (Array.isArray(body.options)) {
    const insOpt = db.prepare(
      `INSERT INTO question_options (question_id, option_key, option_text, is_correct, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    );
    body.options.forEach((opt, idx) => {
      const r = insOpt.run(
        questionId,
        opt.option_key,
        opt.option_text || '',
        opt.is_correct ? 1 : 0,
        opt.sort_order ?? idx
      );
      const optId = Number(r.lastInsertRowid);
      if (Array.isArray(opt.media)) {
        opt.media.forEach((m, mIdx) => {
          insOptMedia.run(questionId, optId, null, null, Number(m.media_id), m.caption || '', m.alt_text || '', m.sort_order ?? mIdx);
        });
      }
    });
  }

  if (Array.isArray(body.matching_pairs)) {
    const insPair = db.prepare(
      `INSERT INTO matching_pairs (question_id, pair_key, left_text, right_key, right_text, score, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    body.matching_pairs.forEach((pair, idx) => {
      const r = insPair.run(
        questionId,
        pair.pair_key,
        pair.left_text || '',
        pair.right_key,
        pair.right_text || '',
        Number(pair.score ?? 5),
        pair.sort_order ?? idx
      );
      const pairId = Number(r.lastInsertRowid);
      if (Array.isArray(pair.left_media)) {
        pair.left_media.forEach((m, mIdx) => {
          insOptMedia.run(questionId, null, pairId, 'LEFT', Number(m.media_id), m.caption || '', m.alt_text || '', m.sort_order ?? mIdx);
        });
      }
      if (Array.isArray(pair.right_media)) {
        pair.right_media.forEach((m, mIdx) => {
          insOptMedia.run(questionId, null, pairId, 'RIGHT', Number(m.media_id), m.caption || '', m.alt_text || '', m.sort_order ?? mIdx);
        });
      }
    });
  }
}

router.post('/', requireTeacherOrAdmin, (req, res) => {
  const body = req.body as QuestionPayloadBody;
  if (!body.bank_id || !body.subject_id || !body.question_type || !body.question_text?.trim()) {
    res.status(400).json({ error: 'Bank soal, mata pelajaran, tipe soal, dan teks pertanyaan wajib diisi.' });
    return;
  }

  const db = getDb();
  const correctStr =
    typeof body.correct_answer_json === 'string'
      ? body.correct_answer_json
      : JSON.stringify(body.correct_answer_json || {});

  let newId = 0;
  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO questions (
           bank_id, subject_id, class_id, created_by_user_id, question_type,
           question_text, instructions, correct_answer_json, partial_credit, default_score, rubric_text, difficulty
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(body.bank_id),
        Number(body.subject_id),
        body.class_id ? Number(body.class_id) : null,
        req.user!.id,
        body.question_type,
        body.question_text.trim(),
        (body.instructions || '').trim(),
        correctStr,
        body.partial_credit === false || body.partial_credit === 0 ? 0 : 1,
        Number(body.default_score || 10),
        (body.rubric_text || '').trim(),
        body.difficulty || 'MEDIUM'
      );
    newId = Number(r.lastInsertRowid);
    saveQuestionRelations(newId, body);
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'CREATE_QUESTION',
    resourceType: 'questions',
    resourceId: newId,
    details: { questionType: body.question_type },
    ipAddress: req.ip,
  });

  const created = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(newId) as Record<string, unknown>;
  res.status(201).json({ question: hydrateQuestion(created) });
});

router.put('/:id', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as QuestionPayloadBody;
  const db = getDb();

  const existing = db.prepare(`SELECT id, created_by_user_id FROM questions WHERE id = ?`).get(id) as
    | { id: number; created_by_user_id: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Soal tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && existing.created_by_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda hanya dapat mengedit soal yang Anda buat.' });
    return;
  }

  const correctStr =
    typeof body.correct_answer_json === 'string'
      ? body.correct_answer_json
      : JSON.stringify(body.correct_answer_json || {});

  db.transaction(() => {
    db.prepare(
      `UPDATE questions SET
         bank_id = COALESCE(?, bank_id),
         subject_id = COALESCE(?, subject_id),
         class_id = ?,
         question_type = COALESCE(?, question_type),
         question_text = COALESCE(?, question_text),
         instructions = COALESCE(?, instructions),
         correct_answer_json = ?,
         partial_credit = ?,
         default_score = COALESCE(?, default_score),
         rubric_text = COALESCE(?, rubric_text),
         difficulty = COALESCE(?, difficulty),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      body.bank_id ? Number(body.bank_id) : null,
      body.subject_id ? Number(body.subject_id) : null,
      body.class_id ? Number(body.class_id) : null,
      body.question_type ?? null,
      body.question_text?.trim() ?? null,
      body.instructions?.trim() ?? null,
      correctStr,
      body.partial_credit === false || body.partial_credit === 0 ? 0 : 1,
      body.default_score ?? null,
      body.rubric_text?.trim() ?? null,
      body.difficulty ?? null,
      id
    );
    saveQuestionRelations(id, body);
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'UPDATE_QUESTION',
    resourceType: 'questions',
    resourceId: id,
    ipAddress: req.ip,
  });

  const updated = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id) as Record<string, unknown>;
  res.json({ question: hydrateQuestion(updated) });
});

router.post('/:id/duplicate', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const row = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Soal tidak ditemukan.' });
    return;
  }

  const hydrated = hydrateQuestion(row);
  let newId = 0;

  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO questions (
           bank_id, subject_id, class_id, created_by_user_id, question_type,
           question_text, instructions, correct_answer_json, partial_credit, default_score, rubric_text, difficulty
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        hydrated.bank_id,
        hydrated.subject_id,
        hydrated.class_id,
        req.user!.id,
        hydrated.question_type,
        `${hydrated.question_text} (Salinan)`,
        hydrated.instructions,
        hydrated.correct_answer_json,
        hydrated.partial_credit,
        hydrated.default_score,
        hydrated.rubric_text,
        hydrated.difficulty
      );
    newId = Number(r.lastInsertRowid);

    saveQuestionRelations(newId, {
      bank_id: Number(hydrated.bank_id),
      subject_id: Number(hydrated.subject_id),
      class_id: hydrated.class_id ? Number(hydrated.class_id) : null,
      question_type: hydrated.question_type as QuestionPayloadBody['question_type'],
      question_text: String(hydrated.question_text),
      correct_answer_json: String(hydrated.correct_answer_json),
      media: (hydrated.media as Array<Record<string, unknown>>).map((m) => ({
        media_id: Number(m.media_id),
        placement: m.placement as 'MAIN_QUESTION',
        caption: String(m.caption || ''),
        alt_text: String(m.alt_text || ''),
        sort_order: Number(m.sort_order || 0),
      })),
      options: (hydrated.options as Array<Record<string, unknown>>).map((o) => ({
        option_key: String(o.option_key),
        option_text: String(o.option_text),
        is_correct: Boolean(o.is_correct),
        sort_order: Number(o.sort_order || 0),
        media: ((o.media as Array<Record<string, unknown>>) || []).map((m) => ({
          media_id: Number(m.media_id),
          caption: String(m.caption || ''),
          alt_text: String(m.alt_text || ''),
          sort_order: Number(m.sort_order || 0),
        })),
      })),
      matching_pairs: (hydrated.matching_pairs as Array<Record<string, unknown>>).map((p) => ({
        pair_key: String(p.pair_key),
        left_text: String(p.left_text),
        right_key: String(p.right_key),
        right_text: String(p.right_text),
        score: Number(p.score || 5),
        sort_order: Number(p.sort_order || 0),
        left_media: ((p.left_media as Array<Record<string, unknown>>) || []).map((m) => ({
          media_id: Number(m.media_id),
          caption: String(m.caption || ''),
          alt_text: String(m.alt_text || ''),
        })),
        right_media: ((p.right_media as Array<Record<string, unknown>>) || []).map((m) => ({
          media_id: Number(m.media_id),
          caption: String(m.caption || ''),
          alt_text: String(m.alt_text || ''),
        })),
      })),
    });
  })();

  const created = db.prepare(`SELECT * FROM questions WHERE id = ?`).get(newId) as Record<string, unknown>;
  res.status(201).json({ question: hydrateQuestion(created) });
});

router.delete('/:id', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare(`SELECT id, created_by_user_id FROM questions WHERE id = ?`).get(id) as
    | { id: number; created_by_user_id: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Soal tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && existing.created_by_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda hanya dapat menghapus soal milik Anda sendiri.' });
    return;
  }

  db.prepare(`DELETE FROM questions WHERE id = ?`).run(id);
  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'DELETE_QUESTION',
    resourceType: 'questions',
    resourceId: id,
    ipAddress: req.ip,
  });

  res.json({ success: true });
});

export default router;
