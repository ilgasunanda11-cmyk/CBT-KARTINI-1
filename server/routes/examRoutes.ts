import express from 'express';
import { getDb } from '../database/db.ts';
import { recordAuditLog, requireTeacherOrAdmin } from '../middleware/auth.ts';

const router = express.Router();

// ==================== PUBLIC STUDENT EXAM ENTRY ROUTES ====================

// Return published exams + classes + subjects for Student Identity Form dropdowns
router.get('/public/options', (_req, res) => {
  const db = getDb();
  const classes = db.prepare(`SELECT id, name, grade_level FROM classes ORDER BY grade_level ASC, name ASC`).all();
  const subjects = db.prepare(`SELECT id, code, name FROM subjects ORDER BY name ASC`).all();
  const exams = db
    .prepare(
      `SELECT e.id, e.title, e.subject_id, s.name as subject_name, e.class_id, e.eligible_class_ids_json,
              e.exam_date, e.start_time, e.end_time, e.duration_minutes, e.question_count, u.full_name as teacher_name
       FROM exams e
       JOIN subjects s ON s.id = e.subject_id
       JOIN users u ON u.id = e.teacher_user_id
       WHERE e.is_published = 1
       ORDER BY e.exam_date ASC, e.start_time ASC`
    )
    .all();

  res.json({ classes, subjects, exams });
});

// Verify Student Identity + Eligibility + Exam Schedule + Exam Code + Duplicate Submissions
router.post('/verify-entry', (req, res) => {
  const { full_name, class_id, participant_number, subject_id, exam_code } = req.body as {
    full_name?: string;
    class_id?: number;
    participant_number?: string;
    subject_id?: number;
    exam_code?: string;
  };

  if (!full_name?.trim() || !class_id || !participant_number?.trim() || !subject_id || !exam_code?.trim()) {
    res.status(400).json({ error: 'Semua kolom identitas dan kode ujian wajib diisi.' });
    return;
  }

  const db = getDb();
  const cleanCode = exam_code.trim().toUpperCase();
  const cleanPartNo = participant_number.trim();

  const exam = db
    .prepare(
      `SELECT e.*, s.name as subject_name, u.full_name as teacher_name
       FROM exams e
       JOIN subjects s ON s.id = e.subject_id
       JOIN users u ON u.id = e.teacher_user_id
       WHERE UPPER(e.exam_code) = ?`
    )
    .get(cleanCode) as
    | (Record<string, unknown> & {
        id: number;
        subject_id: number;
        class_id: number | null;
        eligible_class_ids_json: string;
        is_published: number;
        exam_date: string;
        start_time: string;
        end_time: string;
        duration_minutes: number;
        instructions: string;
        allow_audio_replay: number;
        max_audio_replays: number;
      })
    | undefined;

  if (!exam) {
    res.status(404).json({ error: 'Kode ujian tidak ditemukan. Periksa kembali kode ujian dari pengawas.' });
    return;
  }

  if (exam.is_published !== 1) {
    res.status(403).json({ error: 'Ujian ini belum dipublikasikan atau sedang dinonaktifkan.' });
    return;
  }

  if (Number(exam.subject_id) !== Number(subject_id)) {
    res.status(400).json({ error: 'Mata pelajaran yang dipilih tidak sesuai dengan kode ujian tersebut.' });
    return;
  }

  // Validate class eligibility
  let eligibleClasses: number[] = [];
  try {
    eligibleClasses = JSON.parse(exam.eligible_class_ids_json || '[]') as number[];
  } catch {
    eligibleClasses = [];
  }
  if (exam.class_id && !eligibleClasses.includes(exam.class_id)) {
    eligibleClasses.push(exam.class_id);
  }
  if (eligibleClasses.length > 0 && !eligibleClasses.includes(Number(class_id))) {
    res.status(403).json({ error: 'Kelas Anda tidak terdaftar sebagai peserta yang diizinkan pada ujian ini.' });
    return;
  }

  // Check student registry if participant_number is registered
  const registeredStudent = db
    .prepare(`SELECT id, full_name, class_id, is_active FROM students WHERE UPPER(participant_number) = UPPER(?)`)
    .get(cleanPartNo) as { id: number; full_name: string; class_id: number; is_active: number } | undefined;

  if (registeredStudent) {
    if (registeredStudent.is_active !== 1) {
      res.status(403).json({ error: 'Status peserta Anda sedang nonaktif. Hubungi pengawas ujian.' });
      return;
    }
    if (registeredStudent.class_id !== Number(class_id)) {
      res.status(400).json({ error: 'Kelas yang dipilih tidak sesuai dengan data peserta terdaftar.' });
      return;
    }
  }

  // Check schedule window (validate date & end_time if configured in ISO YYYY-MM-DD HH:mm)
  const now = new Date();
  const startDt = new Date(`${exam.exam_date}T${exam.start_time}:00`);
  const endDt = new Date(`${exam.exam_date}T${exam.end_time}:00`);
  if (!Number.isNaN(startDt.getTime()) && !Number.isNaN(endDt.getTime())) {
    // Allow 15 min early lobby entry before start_time; block after end_time
    if (now.getTime() < startDt.getTime() - 15 * 60 * 1000) {
      res.status(403).json({
        error: `Ujian dijadwalkan mulai pada ${exam.exam_date} pukul ${exam.start_time}.`,
      });
      return;
    }
    if (now.getTime() > endDt.getTime()) {
      res.status(403).json({
        error: `Jadwal ujian telah berakhir pada ${exam.exam_date} pukul ${exam.end_time}.`,
      });
      return;
    }
  }

  const classRow = db.prepare(`SELECT id, name FROM classes WHERE id = ?`).get(Number(class_id)) as
    | { id: number; name: string }
    | undefined;
  if (!classRow) {
    res.status(400).json({ error: 'Kelas tidak valid.' });
    return;
  }

  // Check duplicate submission / existing session
  const existingSession = db
    .prepare(`SELECT * FROM exam_sessions WHERE exam_id = ? AND UPPER(participant_number) = UPPER(?)`)
    .get(exam.id, cleanPartNo) as
    | (Record<string, unknown> & { id: number; status: string })
    | undefined;

  if (existingSession) {
    if (existingSession.status === 'SUBMITTED' || existingSession.status === 'AUTO_SUBMITTED') {
      res.status(409).json({
        error: 'Nomor peserta ini sudah menyelesaikan dan mengirimkan ujian ini. Pengiriman ganda tidak diizinkan.',
      });
      return;
    }
    // Resume READY or IN_PROGRESS session cleanly
    res.json({
      verified: true,
      resumed: true,
      session: existingSession,
      exam: {
        id: exam.id,
        title: exam.title,
        subject_name: exam.subject_name,
        teacher_name: exam.teacher_name,
        duration_minutes: exam.duration_minutes,
        instructions: exam.instructions,
        allow_audio_replay: exam.allow_audio_replay,
        max_audio_replays: exam.max_audio_replays,
        question_count: exam.question_count,
      },
    });
    return;
  }

  // Create READY session
  const r = db
    .prepare(
      `INSERT INTO exam_sessions (
         exam_id, student_id, student_name, participant_number, class_id, class_name, status
       ) VALUES (?, ?, ?, ?, ?, ?, 'READY')`
    )
    .run(
      exam.id,
      registeredStudent?.id ?? null,
      full_name.trim(),
      cleanPartNo,
      classRow.id,
      classRow.name
    );

  const session = db.prepare(`SELECT * FROM exam_sessions WHERE id = ?`).get(Number(r.lastInsertRowid));

  res.json({
    verified: true,
    resumed: false,
    session,
    exam: {
      id: exam.id,
      title: exam.title,
      subject_name: exam.subject_name,
      teacher_name: exam.teacher_name,
      duration_minutes: exam.duration_minutes,
      instructions: exam.instructions,
      allow_audio_replay: exam.allow_audio_replay,
      max_audio_replays: exam.max_audio_replays,
      question_count: exam.question_count,
    },
  });
});

// ==================== ADMIN & TEACHER EXAM MANAGEMENT ====================

router.get('/', requireTeacherOrAdmin, (req, res) => {
  const db = getDb();
  const isAdmin = req.user!.role === 'ADMIN';
  let sql = `
    SELECT e.*, s.name as subject_name, c.name as class_name, u.full_name as teacher_name,
      (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) as assigned_question_count,
      (SELECT COUNT(*) FROM exam_sessions es WHERE es.exam_id = e.id) as session_count
    FROM exams e
    JOIN subjects s ON s.id = e.subject_id
    LEFT JOIN classes c ON c.id = e.class_id
    JOIN users u ON u.id = e.teacher_user_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (!isAdmin) {
    sql += ` AND e.teacher_user_id = ?`;
    params.push(req.user!.id);
  }
  sql += ` ORDER BY e.exam_date DESC, e.id DESC`;
  const exams = db.prepare(sql).all(...params);
  res.json({ exams });
});

router.get('/:id', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const exam = db
    .prepare(
      `SELECT e.*, s.name as subject_name, u.full_name as teacher_name
       FROM exams e
       JOIN subjects s ON s.id = e.subject_id
       JOIN users u ON u.id = e.teacher_user_id
       WHERE e.id = ?`
    )
    .get(id) as (Record<string, unknown> & { teacher_user_id: number }) | undefined;

  if (!exam) {
    res.status(404).json({ error: 'Ujian tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && exam.teacher_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda tidak memiliki akses ke ujian ini.' });
    return;
  }

  const questions = db
    .prepare(
      `SELECT eq.sort_order, eq.score_override, q.id, q.question_type, q.question_text, q.default_score, s.name as subject_name
       FROM exam_questions eq
       JOIN questions q ON q.id = eq.question_id
       JOIN subjects s ON s.id = q.subject_id
       WHERE eq.exam_id = ?
       ORDER BY eq.sort_order ASC, eq.id ASC`
    )
    .all(id);

  res.json({ exam, questions });
});

router.post('/', requireTeacherOrAdmin, (req, res) => {
  const {
    title,
    subject_id,
    class_id,
    eligible_class_ids,
    teacher_user_id,
    exam_date,
    start_time,
    end_time,
    duration_minutes,
    exam_code,
    question_count,
    randomize_questions,
    randomize_options,
    instructions,
    is_published,
    allow_audio_replay,
    max_audio_replays,
    question_ids,
  } = req.body as {
    title?: string;
    subject_id?: number;
    class_id?: number | null;
    eligible_class_ids?: number[];
    teacher_user_id?: number;
    exam_date?: string;
    start_time?: string;
    end_time?: string;
    duration_minutes?: number;
    exam_code?: string;
    question_count?: number;
    randomize_questions?: boolean;
    randomize_options?: boolean;
    instructions?: string;
    is_published?: boolean;
    allow_audio_replay?: boolean;
    max_audio_replays?: number;
    question_ids?: number[];
  };

  if (!title?.trim() || !subject_id || !exam_date || !start_time || !end_time || !exam_code?.trim()) {
    res.status(400).json({ error: 'Judul, mata pelajaran, tanggal, waktu mulai/selesai, dan kode ujian wajib diisi.' });
    return;
  }

  const db = getDb();
  const cleanCode = exam_code.trim().toUpperCase();
  const dup = db.prepare(`SELECT id FROM exams WHERE UPPER(exam_code) = ?`).get(cleanCode);
  if (dup) {
    res.status(409).json({ error: 'Kode ujian sudah digunakan oleh ujian lain.' });
    return;
  }

  const assignedTeacherId =
    req.user!.role === 'ADMIN' && teacher_user_id ? Number(teacher_user_id) : req.user!.id;

  const eligibleArr = Array.isArray(eligible_class_ids)
    ? eligible_class_ids
    : class_id
      ? [Number(class_id)]
      : [];

  let newExamId = 0;
  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO exams (
           title, subject_id, class_id, eligible_class_ids_json, teacher_user_id,
           exam_date, start_time, end_time, duration_minutes, exam_code, question_count,
           randomize_questions, randomize_options, instructions, is_published,
           allow_audio_replay, max_audio_replays
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
        Number(subject_id),
        class_id ? Number(class_id) : eligibleArr[0] ?? null,
        JSON.stringify(eligibleArr),
        assignedTeacherId,
        exam_date,
        start_time,
        end_time,
        Number(duration_minutes || 60),
        cleanCode,
        Number(question_count || (question_ids?.length ?? 0)),
        randomize_questions ? 1 : 0,
        randomize_options ? 1 : 0,
        (instructions || '').trim(),
        is_published ? 1 : 0,
        allow_audio_replay === false ? 0 : 1,
        Number(max_audio_replays ?? 3)
      );
    newExamId = Number(r.lastInsertRowid);

    if (Array.isArray(question_ids) && question_ids.length > 0) {
      const insEq = db.prepare(`INSERT INTO exam_questions (exam_id, question_id, sort_order) VALUES (?, ?, ?)`);
      question_ids.forEach((qid, idx) => {
        insEq.run(newExamId, Number(qid), idx + 1);
      });
    }
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'CREATE_EXAM',
    resourceType: 'exams',
    resourceId: newExamId,
    details: { title: title.trim(), examCode: cleanCode },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: newExamId });
});

router.put('/:id', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM exams WHERE id = ?`).get(id) as
    | { id: number; teacher_user_id: number }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Ujian tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && existing.teacher_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda hanya dapat mengedit ujian yang menjadi wewenang Anda.' });
    return;
  }

  const body = req.body as Record<string, unknown>;

  db.transaction(() => {
    db.prepare(
      `UPDATE exams SET
         title = COALESCE(?, title),
         subject_id = COALESCE(?, subject_id),
         class_id = ?,
         eligible_class_ids_json = COALESCE(?, eligible_class_ids_json),
         exam_date = COALESCE(?, exam_date),
         start_time = COALESCE(?, start_time),
         end_time = COALESCE(?, end_time),
         duration_minutes = COALESCE(?, duration_minutes),
         exam_code = COALESCE(?, exam_code),
         question_count = COALESCE(?, question_count),
         randomize_questions = COALESCE(?, randomize_questions),
         randomize_options = COALESCE(?, randomize_options),
         instructions = COALESCE(?, instructions),
         is_published = COALESCE(?, is_published),
         allow_audio_replay = COALESCE(?, allow_audio_replay),
         max_audio_replays = COALESCE(?, max_audio_replays),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      body.title ? String(body.title).trim() : null,
      body.subject_id ? Number(body.subject_id) : null,
      body.class_id !== undefined ? (body.class_id ? Number(body.class_id) : null) : null,
      Array.isArray(body.eligible_class_ids) ? JSON.stringify(body.eligible_class_ids) : null,
      body.exam_date ? String(body.exam_date) : null,
      body.start_time ? String(body.start_time) : null,
      body.end_time ? String(body.end_time) : null,
      body.duration_minutes !== undefined ? Number(body.duration_minutes) : null,
      body.exam_code ? String(body.exam_code).trim().toUpperCase() : null,
      body.question_count !== undefined ? Number(body.question_count) : null,
      body.randomize_questions !== undefined ? (body.randomize_questions ? 1 : 0) : null,
      body.randomize_options !== undefined ? (body.randomize_options ? 1 : 0) : null,
      body.instructions !== undefined ? String(body.instructions).trim() : null,
      body.is_published !== undefined ? (body.is_published ? 1 : 0) : null,
      body.allow_audio_replay !== undefined ? (body.allow_audio_replay ? 1 : 0) : null,
      body.max_audio_replays !== undefined ? Number(body.max_audio_replays) : null,
      id
    );

    if (Array.isArray(body.question_ids)) {
      db.prepare(`DELETE FROM exam_questions WHERE exam_id = ?`).run(id);
      const insEq = db.prepare(`INSERT INTO exam_questions (exam_id, question_id, sort_order) VALUES (?, ?, ?)`);
      (body.question_ids as number[]).forEach((qid, idx) => {
        insEq.run(id, Number(qid), idx + 1);
      });
    }
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'UPDATE_EXAM',
    resourceType: 'exams',
    resourceId: id,
    ipAddress: req.ip,
  });

  res.json({ success: true });
});

router.delete('/:id', requireTeacherOrAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare(`SELECT id, teacher_user_id FROM exams WHERE id = ?`).get(id) as
    | { id: number; teacher_user_id: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Ujian tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && existing.teacher_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda tidak memiliki izin untuk menghapus ujian ini.' });
    return;
  }
  db.prepare(`DELETE FROM exams WHERE id = ?`).run(id);
  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'DELETE_EXAM',
    resourceType: 'exams',
    resourceId: id,
    ipAddress: req.ip,
  });
  res.json({ success: true });
});

export default router;
