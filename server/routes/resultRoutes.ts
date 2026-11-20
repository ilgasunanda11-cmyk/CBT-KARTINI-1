import express from 'express';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getDb } from '../database/db.ts';
import { recordAuditLog, requireTeacherOrAdmin } from '../middleware/auth.ts';
import { recalculateSessionScores } from '../services/gradingService.ts';

const router = express.Router();

// List results & summary analytics across exams or for specific exam
router.get('/', requireTeacherOrAdmin, (req, res) => {
  const db = getDb();
  const isAdmin = req.user!.role === 'ADMIN';
  const examId = req.query.examId ? Number(req.query.examId) : null;
  const classId = req.query.classId ? Number(req.query.classId) : null;

  let sql = `
    SELECT es.id, es.exam_id, es.student_name, es.participant_number, es.class_id, es.class_name,
           es.status, es.started_at, es.submitted_at, es.total_score, es.max_score,
           es.auto_graded_score, es.essay_score, es.violation_count, es.question_order_json,
           e.title as exam_title, e.exam_code, s.name as subject_name, u.full_name as teacher_name
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    JOIN subjects s ON s.id = e.subject_id
    JOIN users u ON u.id = e.teacher_user_id
    WHERE es.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
  `;
  const params: unknown[] = [];

  if (!isAdmin) {
    sql += ` AND e.teacher_user_id = ?`;
    params.push(req.user!.id);
  }
  if (examId) {
    sql += ` AND es.exam_id = ?`;
    params.push(examId);
  }
  if (classId) {
    sql += ` AND es.class_id = ?`;
    params.push(classId);
  }

  sql += ` ORDER BY es.total_score DESC, es.submitted_at ASC`;
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  // Enrich with counts and class ranking
  const enriched = rows.map((row, idx) => {
    const sid = Number(row.id);
    const qOrder = JSON.parse(String(row.question_order_json || '[]')) as number[];
    const ansRows = db
      .prepare(`SELECT answer_json, is_correct FROM student_answers WHERE session_id = ?`)
      .all(sid) as Array<{ answer_json: string; is_correct: number | null }>;

    let correctCount = 0;
    let incorrectCount = 0;
    let answeredCount = 0;
    let pendingEssayCount = 0;

    for (const a of ansRows) {
      let val: unknown = null;
      try {
        val = JSON.parse(a.answer_json);
      } catch {
        val = null;
      }
      const isEmpty =
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === 'object' && val !== null && Object.keys(vObj(val)).length === 0);

      if (!isEmpty) answeredCount += 1;
      if (a.is_correct === 1) correctCount += 1;
      else if (a.is_correct === 0 && !isEmpty) incorrectCount += 1;
      else if (a.is_correct === null && !isEmpty) pendingEssayCount += 1;
    }

    const totalQuestions = qOrder.length;
    const durationSeconds =
      row.started_at && row.submitted_at
        ? Math.max(
            0,
            Math.round((new Date(String(row.submitted_at)).getTime() - new Date(String(row.started_at)).getTime()) / 1000)
          )
        : 0;

    return {
      ...row,
      rank: idx + 1,
      total_questions: totalQuestions,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      unanswered_count: Math.max(0, totalQuestions - answeredCount),
      pending_essay_count: pendingEssayCount,
      duration_seconds: durationSeconds,
    };
  });

  const scores = enriched.map((r) => Number((r as Record<string, unknown>).total_score || 0));
  const stats =
    scores.length > 0
      ? {
          count: scores.length,
          highest: Math.max(...scores),
          lowest: Math.min(...scores),
          average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
        }
      : { count: 0, highest: 0, lowest: 0, average: 0 };

  res.json({ results: enriched, stats });
});

function vObj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

// Detailed single session result (answers, essay grading, feedback, violation history)
router.get('/:id', requireTeacherOrAdmin, (req, res) => {
  const sessionId = Number(req.params.id);
  const db = getDb();

  const session = db
    .prepare(
      `SELECT es.*, e.title as exam_title, e.exam_code, e.teacher_user_id, s.name as subject_name, u.full_name as teacher_name
       FROM exam_sessions es
       JOIN exams e ON e.id = es.exam_id
       JOIN subjects s ON s.id = e.subject_id
       JOIN users u ON u.id = e.teacher_user_id
       WHERE es.id = ?`
    )
    .get(sessionId) as (Record<string, unknown> & { teacher_user_id: number; question_order_json: string }) | undefined;

  if (!session) {
    res.status(404).json({ error: 'Hasil ujian tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && session.teacher_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda tidak memiliki akses ke hasil ujian ini.' });
    return;
  }

  const questionOrder = JSON.parse(session.question_order_json || '[]') as number[];
  const details: Array<Record<string, unknown>> = [];

  for (const qid of questionOrder) {
    const q = db
      .prepare(
        `SELECT q.*, eq.score_override
         FROM questions q
         LEFT JOIN exam_questions eq ON eq.question_id = q.id AND eq.exam_id = ?
         WHERE q.id = ?`
      )
      .get(session.exam_id, qid) as Record<string, unknown> | undefined;
    if (!q) continue;

    const ans = db
      .prepare(`SELECT * FROM student_answers WHERE session_id = ? AND question_id = ?`)
      .get(sessionId, qid) as Record<string, unknown> | undefined;

    const essayGrade = db
      .prepare(
        `SELECT eg.*, u.full_name as grader_name
         FROM essay_grades eg
         JOIN users u ON u.id = eg.graded_by_user_id
         WHERE eg.session_id = ? AND eg.question_id = ?`
      )
      .get(sessionId, qid);

    const options = db
      .prepare(`SELECT * FROM question_options WHERE question_id = ? ORDER BY sort_order ASC`)
      .all(qid);
    const matchingPairs = db
      .prepare(`SELECT * FROM matching_pairs WHERE question_id = ? ORDER BY sort_order ASC`)
      .all(qid);

    details.push({
      question: q,
      options,
      matching_pairs: matchingPairs,
      student_answer: ans ? JSON.parse(String(ans.answer_json || 'null')) : null,
      is_correct: ans ? ans.is_correct : 0,
      score_awarded: ans ? ans.score_awarded : 0,
      max_score: ans ? ans.max_score : Number(q.score_override ?? q.default_score),
      essay_grade: essayGrade || null,
    });
  }

  const violations = db
    .prepare(`SELECT * FROM exam_violations WHERE session_id = ? ORDER BY occurred_at ASC`)
    .all(sessionId);

  res.json({ session, details, violations });
});

// Manual Essay Grading
router.post('/:id/grade-essay', requireTeacherOrAdmin, (req, res) => {
  const sessionId = Number(req.params.id);
  const { question_id, score_awarded, feedback } = req.body as {
    question_id?: number;
    score_awarded?: number;
    feedback?: string;
  };

  if (!question_id || score_awarded === undefined || score_awarded < 0) {
    res.status(400).json({ error: 'ID soal dan skor nilai yang valid wajib diisi.' });
    return;
  }

  const db = getDb();
  const session = db
    .prepare(
      `SELECT es.id, es.exam_id, e.teacher_user_id
       FROM exam_sessions es
       JOIN exams e ON e.id = es.exam_id
       WHERE es.id = ?`
    )
    .get(sessionId) as { id: number; exam_id: number; teacher_user_id: number } | undefined;

  if (!session) {
    res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && session.teacher_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda tidak berwenang menilai esai pada ujian ini.' });
    return;
  }

  const qRow = db
    .prepare(
      `SELECT q.id, q.question_type, q.default_score, eq.score_override
       FROM questions q
       LEFT JOIN exam_questions eq ON eq.question_id = q.id AND eq.exam_id = ?
       WHERE q.id = ?`
    )
    .get(session.exam_id, Number(question_id)) as
    | { id: number; question_type: string; default_score: number; score_override: number | null }
    | undefined;

  if (!qRow || qRow.question_type !== 'ESSAY') {
    res.status(400).json({ error: 'Soal bukan bertipe Esai.' });
    return;
  }

  const maxScore = qRow.score_override ?? qRow.default_score;
  const clampedScore = Math.min(maxScore, Math.max(0, Number(score_awarded)));

  const newScores = db.transaction(() => {
    db.prepare(
      `INSERT INTO essay_grades (session_id, question_id, graded_by_user_id, score_awarded, max_score, feedback, graded_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(session_id, question_id) DO UPDATE SET
         graded_by_user_id = excluded.graded_by_user_id,
         score_awarded = excluded.score_awarded,
         max_score = excluded.max_score,
         feedback = excluded.feedback,
         graded_at = datetime('now')`
    ).run(sessionId, Number(question_id), req.user!.id, clampedScore, maxScore, (feedback || '').trim());

    return recalculateSessionScores(sessionId, db);
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'GRADE_ESSAY',
    resourceType: 'essay_grades',
    resourceId: `${sessionId}:${question_id}`,
    details: { scoreAwarded: clampedScore, maxScore },
    ipAddress: req.ip,
  });

  res.json({ success: true, ...newScores });
});

// Export Results to Excel (.xlsx) or CSV (.csv)
router.get('/export/:examId', requireTeacherOrAdmin, (req, res) => {
  const examId = Number(req.params.examId);
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const db = getDb();

  const exam = db
    .prepare(`SELECT e.*, s.name as subject_name FROM exams e JOIN subjects s ON s.id = e.subject_id WHERE e.id = ?`)
    .get(examId) as { id: number; title: string; subject_name: string; teacher_user_id: number } | undefined;

  if (!exam) {
    res.status(404).json({ error: 'Ujian tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'ADMIN' && exam.teacher_user_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda tidak memiliki akses ekspor ujian ini.' });
    return;
  }

  const sessions = db
    .prepare(
      `SELECT * FROM exam_sessions
       WHERE exam_id = ? AND status IN ('SUBMITTED', 'AUTO_SUBMITTED')
       ORDER BY total_score DESC, submitted_at ASC`
    )
    .all(examId) as Array<Record<string, unknown>>;

  const exportRows = sessions.map((s, idx) => ({
    Peringkat: idx + 1,
    'No. Peserta': s.participant_number,
    'Nama Siswa': s.student_name,
    Kelas: s.class_name,
    'Mata Pelajaran': exam.subject_name,
    Ujian: exam.title,
    Status: s.status,
    'Skor Otomatis': s.auto_graded_score,
    'Skor Esai': s.essay_score,
    'Total Skor': s.total_score,
    'Skor Maksimal': s.max_score,
    Pelanggaran: s.violation_count,
    'Waktu Mulai': s.started_at,
    'Waktu Selesai': s.submitted_at,
  }));

  if (format === 'csv') {
    const csv = Papa.unparse(exportRows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Hasil_Ujian_${examId}.csv"`);
    res.send(csv);
    return;
  }

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hasil Ujian');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Hasil_Ujian_${examId}.xlsx"`);
  res.send(buf);
});

export default router;
