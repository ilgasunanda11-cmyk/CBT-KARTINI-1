import express from 'express';
import { getDb } from '../database/db.ts';
import { requireTeacherOrAdmin } from '../middleware/auth.ts';
import { broadcastMonitoringEvent } from '../websocket/wsServer.ts';

const router = express.Router();

// Live monitoring snapshot for Admin (all exams) or Teacher (authorized exams)
router.get('/', requireTeacherOrAdmin, (req, res) => {
  const db = getDb();
  const isAdmin = req.user!.role === 'ADMIN';
  const examId = req.query.examId ? Number(req.query.examId) : null;

  let sql = `
    SELECT es.id, es.exam_id, es.student_name, es.participant_number, es.class_name,
           es.status, es.started_at, es.expires_at, es.submitted_at, es.violation_count,
           es.question_order_json, es.last_heartbeat_at,
           e.title as exam_title, e.exam_code, s.name as subject_name
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    JOIN subjects s ON s.id = e.subject_id
    WHERE 1=1
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
  sql += ` ORDER BY es.created_at DESC`;

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  const sessions = rows.map((row) => {
    const sid = Number(row.id);
    const qOrder = JSON.parse(String(row.question_order_json || '[]')) as number[];
    const totalQuestions = qOrder.length;

    const ansRows = db
      .prepare(`SELECT answer_json FROM student_answers WHERE session_id = ?`)
      .all(sid) as Array<{ answer_json: string }>;

    const answeredCount = ansRows.filter((r) => {
      try {
        const v = JSON.parse(r.answer_json);
        if (v === null || v === '') return false;
        if (Array.isArray(v) && v.length === 0) return false;
        if (typeof v === 'object' && Object.keys(v).length === 0) return false;
        return true;
      } catch {
        return false;
      }
    }).length;

    const remainingSeconds =
      row.status === 'IN_PROGRESS' && row.expires_at
        ? Math.max(0, Math.floor((new Date(String(row.expires_at)).getTime() - Date.now()) / 1000))
        : 0;

    const violations = db
      .prepare(`SELECT violation_type, details, occurred_at FROM exam_violations WHERE session_id = ? ORDER BY id DESC LIMIT 10`)
      .all(sid);

    return {
      ...row,
      total_questions: totalQuestions,
      answered_count: answeredCount,
      unanswered_count: Math.max(0, totalQuestions - answeredCount),
      remaining_seconds: remainingSeconds,
      recent_violations: violations,
    };
  });

  res.json({ sessions });
});

// Record anti-cheating violation from Student Exam Interface (never deletes student answers)
router.post('/violation', (req, res) => {
  const { session_id, exam_id, violation_type, details } = req.body as {
    session_id?: number;
    exam_id?: number;
    violation_type?: 'TAB_SWITCH' | 'EXIT_FULLSCREEN' | 'WINDOW_BLUR' | 'PAGE_HIDE';
    details?: string;
  };

  if (!session_id || !exam_id || !violation_type) {
    res.status(400).json({ error: 'Parameter pelanggaran tidak lengkap.' });
    return;
  }

  const db = getDb();
  const session = db
    .prepare(`SELECT id, student_name, participant_number, class_name, status, violation_count FROM exam_sessions WHERE id = ? AND exam_id = ?`)
    .get(Number(session_id), Number(exam_id)) as
    | {
        id: number;
        student_name: string;
        participant_number: string;
        class_name: string;
        status: string;
        violation_count: number;
      }
    | undefined;

  if (!session || session.status !== 'IN_PROGRESS') {
    res.status(404).json({ error: 'Sesi aktif tidak ditemukan.' });
    return;
  }

  let newCount = session.violation_count;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO exam_violations (session_id, exam_id, violation_type, details) VALUES (?, ?, ?, ?)`
    ).run(session.id, Number(exam_id), violation_type, (details || '').slice(0, 300));

    db.prepare(`UPDATE exam_sessions SET violation_count = violation_count + 1 WHERE id = ?`).run(session.id);
    newCount += 1;
  })();

  broadcastMonitoringEvent(Number(exam_id), 'session:violation', {
    sessionId: session.id,
    studentName: session.student_name,
    participantNumber: session.participant_number,
    className: session.class_name,
    violationType: violation_type,
    details: details || '',
    violationCount: newCount,
    occurredAt: new Date().toISOString(),
  });

  res.status(201).json({ recorded: true, violationCount: newCount });
});

export default router;
