import express from 'express';
import { getDb } from '../database/db.ts';
import { recalculateSessionScores } from '../services/gradingService.ts';
import { broadcastMonitoringEvent } from '../websocket/wsServer.ts';

const router = express.Router();

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildSanitizedExamQuestions(
  examId: number,
  questionOrder: number[],
  optionOrderMap: Record<string, string[]>
) {
  const db = getDb();
  const results: Array<Record<string, unknown>> = [];

  for (const qid of questionOrder) {
    const q = db
      .prepare(
        `SELECT q.id, q.question_type, q.question_text, q.instructions, q.default_score, eq.score_override
         FROM exam_questions eq
         JOIN questions q ON q.id = eq.question_id
         WHERE eq.exam_id = ? AND q.id = ?`
      )
      .get(examId, qid) as Record<string, unknown> | undefined;

    if (!q) continue;

    // Fetch question media (Main, Instructions, Statement, Supporting Material)
    const questionMedia = db
      .prepare(
        `SELECT qm.id, qm.media_id, qm.placement, qm.caption, qm.alt_text, qm.sort_order,
                m.media_type, m.original_name, m.mime_type, m.duration_seconds
         FROM question_media qm
         JOIN media_files m ON m.id = qm.media_id
         WHERE qm.question_id = ?
         ORDER BY qm.sort_order ASC, qm.id ASC`
      )
      .all(qid);

    const optionMedia = db
      .prepare(
        `SELECT om.id, om.option_id, om.matching_pair_id, om.matching_side, om.media_id, om.caption, om.alt_text,
                m.media_type, m.original_name, m.mime_type, m.duration_seconds
         FROM option_media om
         JOIN media_files m ON m.id = om.media_id
         WHERE om.question_id = ?
         ORDER BY om.sort_order ASC, om.id ASC`
      )
      .all(qid) as Array<Record<string, unknown>>;

    // NEVER expose is_correct to student!
    const rawOptions = db
      .prepare(
        `SELECT id, option_key, option_text, sort_order
         FROM question_options WHERE question_id = ? ORDER BY sort_order ASC, id ASC`
      )
      .all(qid) as Array<Record<string, unknown>>;

    const optOrder = optionOrderMap[String(qid)];
    const orderedOptions =
      optOrder && optOrder.length > 0
        ? optOrder
            .map((k) => rawOptions.find((o) => o.option_key === k))
            .filter((x): x is Record<string, unknown> => Boolean(x))
        : rawOptions;

    const sanitizedOptions = orderedOptions.map((o) => ({
      id: o.id,
      option_key: o.option_key,
      option_text: o.option_text,
      media: optionMedia.filter((m) => m.option_id === o.id),
    }));

    // For MATCHING: separate left items and randomized right items WITHOUT leaking which pair_key matches which right_key
    const rawPairs = db
      .prepare(
        `SELECT id, pair_key, left_text, right_key, right_text, score, sort_order
         FROM matching_pairs WHERE question_id = ? ORDER BY sort_order ASC, id ASC`
      )
      .all(qid) as Array<{
      id: number;
      pair_key: string;
      left_text: string;
      right_key: string;
      right_text: string;
      score: number;
    }>;

    const leftItems = rawPairs.map((p) => ({
      id: p.id,
      pair_key: p.pair_key,
      left_text: p.left_text,
      media: optionMedia.filter((m) => m.matching_pair_id === p.id && m.matching_side === 'LEFT'),
    }));

    const rightOrderKeys = optionOrderMap[`match_${qid}`];
    const rawRightItems = rawPairs.map((p) => ({
      pair_id: p.id,
      right_key: p.right_key,
      right_text: p.right_text,
      media: optionMedia.filter((m) => m.matching_pair_id === p.id && m.matching_side === 'RIGHT'),
    }));
    const rightItems =
      rightOrderKeys && rightOrderKeys.length > 0
        ? rightOrderKeys
            .map((rk) => rawRightItems.find((r) => r.right_key === rk))
            .filter((x): x is (typeof rawRightItems)[number] => Boolean(x))
        : rawRightItems;

    results.push({
      id: q.id,
      question_type: q.question_type,
      question_text: q.question_text,
      instructions: q.instructions,
      score: q.score_override ?? q.default_score,
      media: questionMedia,
      options: sanitizedOptions,
      matching_left: leftItems,
      matching_right: rightItems,
    });
  }

  return results;
}

// Start or resume an exam session (called after AudioCheck & ExamInstructions)
router.post('/:id/start', (req, res) => {
  const examId = Number(req.params.id);
  const { session_id, audio_checked, rules_confirmed } = req.body as {
    session_id?: number;
    audio_checked?: boolean;
    rules_confirmed?: boolean;
  };

  if (!session_id) {
    res.status(400).json({ error: 'ID sesi ujian wajib disertakan.' });
    return;
  }

  const db = getDb();
  const session = db
    .prepare(`SELECT * FROM exam_sessions WHERE id = ? AND exam_id = ?`)
    .get(Number(session_id), examId) as
    | {
        id: number;
        exam_id: number;
        student_name: string;
        participant_number: string;
        class_name: string;
        status: string;
        question_order_json: string;
        option_order_json: string;
        started_at: string | null;
        expires_at: string | null;
      }
    | undefined;

  if (!session) {
    res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    return;
  }

  if (session.status === 'SUBMITTED' || session.status === 'AUTO_SUBMITTED') {
    res.status(409).json({ error: 'Ujian ini sudah diselesaikan dan dikirimkan.' });
    return;
  }

  const exam = db
    .prepare(
      `SELECT e.*, s.name as subject_name
       FROM exams e
       JOIN subjects s ON s.id = e.subject_id
       WHERE e.id = ?`
    )
    .get(examId) as
    | (Record<string, unknown> & {
        id: number;
        title: string;
        subject_name: string;
        duration_minutes: number;
        question_count: number;
        randomize_questions: number;
        randomize_options: number;
        allow_audio_replay: number;
        max_audio_replays: number;
      })
    | undefined;

  if (!exam) {
    res.status(404).json({ error: 'Ujian tidak ditemukan.' });
    return;
  }

  let questionOrder: number[] = [];
  let optionOrderMap: Record<string, string[]> = {};

  if (session.status === 'READY' || !session.started_at || !session.expires_at) {
    if (!audio_checked || !rules_confirmed) {
      res.status(400).json({ error: 'Anda harus menyelesaikan cek audio dan menyetujui tata tertib ujian.' });
      return;
    }

    const eqRows = db
      .prepare(`SELECT question_id FROM exam_questions WHERE exam_id = ? ORDER BY sort_order ASC, id ASC`)
      .all(examId) as Array<{ question_id: number }>;

    let qIds = eqRows.map((r) => r.question_id);
    if (exam.randomize_questions === 1) {
      qIds = shuffleArray(qIds);
    }
    if (exam.question_count > 0 && qIds.length > exam.question_count) {
      qIds = qIds.slice(0, exam.question_count);
    }
    questionOrder = qIds;

    for (const qid of questionOrder) {
      const qMeta = db.prepare(`SELECT question_type FROM questions WHERE id = ?`).get(qid) as
        | { question_type: string }
        | undefined;
      if (!qMeta) continue;

      if (
        (qMeta.question_type === 'MULTIPLE_CHOICE' || qMeta.question_type === 'MULTIPLE_SELECT') &&
        exam.randomize_options === 1
      ) {
        const opts = db
          .prepare(`SELECT option_key FROM question_options WHERE question_id = ? ORDER BY sort_order ASC`)
          .all(qid) as Array<{ option_key: string }>;
        optionOrderMap[String(qid)] = shuffleArray(opts.map((o) => o.option_key));
      }

      if (qMeta.question_type === 'MATCHING') {
        const pairs = db
          .prepare(`SELECT right_key FROM matching_pairs WHERE question_id = ? ORDER BY sort_order ASC`)
          .all(qid) as Array<{ right_key: string }>;
        // Always randomize matching right column options per prompt requirement
        optionOrderMap[`match_${qid}`] = shuffleArray(pairs.map((p) => p.right_key));
      }
    }

    const nowMs = Date.now();
    const startedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + exam.duration_minutes * 60 * 1000).toISOString();

    db.prepare(
      `UPDATE exam_sessions SET
         status = 'IN_PROGRESS',
         question_order_json = ?,
         option_order_json = ?,
         audio_checked = 1,
         rules_confirmed = 1,
         started_at = ?,
         expires_at = ?,
         last_heartbeat_at = datetime('now')
       WHERE id = ?`
    ).run(JSON.stringify(questionOrder), JSON.stringify(optionOrderMap), startedAt, expiresAt, session.id);

    session.started_at = startedAt;
    session.expires_at = expiresAt;
    session.status = 'IN_PROGRESS';

    broadcastMonitoringEvent(examId, 'session:started', {
      sessionId: session.id,
      studentName: session.student_name,
      participantNumber: session.participant_number,
      className: session.class_name,
      startedAt,
      expiresAt,
      totalQuestions: questionOrder.length,
    });
  } else {
    questionOrder = JSON.parse(session.question_order_json || '[]') as number[];
    optionOrderMap = JSON.parse(session.option_order_json || '{}') as Record<string, string[]>;
  }

  // Server-side timer validation (never reset on refresh)
  const remainingSeconds = Math.max(0, Math.floor((new Date(session.expires_at!).getTime() - Date.now()) / 1000));

  if (remainingSeconds <= 0) {
    // Auto-submit expired session immediately
    const scores = recalculateSessionScores(session.id, db);
    db.prepare(
      `UPDATE exam_sessions SET status = 'AUTO_SUBMITTED', submitted_at = datetime('now') WHERE id = ?`
    ).run(session.id);
    broadcastMonitoringEvent(examId, 'session:submitted', {
      sessionId: session.id,
      status: 'AUTO_SUBMITTED',
      ...scores,
    });
    res.status(410).json({
      error: 'Waktu ujian telah habis dan jawaban Anda telah dikirimkan secara otomatis.',
      autoSubmitted: true,
      sessionId: session.id,
    });
    return;
  }

  const questions = buildSanitizedExamQuestions(examId, questionOrder, optionOrderMap);
  const savedAnswersRows = db
    .prepare(`SELECT question_id, answer_json, audio_play_count FROM student_answers WHERE session_id = ?`)
    .all(session.id) as Array<{ question_id: number; answer_json: string; audio_play_count: number }>;

  const savedAnswers: Record<number, unknown> = {};
  const audioPlayCounts: Record<number, number> = {};
  for (const row of savedAnswersRows) {
    try {
      savedAnswers[row.question_id] = JSON.parse(row.answer_json);
    } catch {
      savedAnswers[row.question_id] = null;
    }
    audioPlayCounts[row.question_id] = row.audio_play_count;
  }

  res.json({
    session: {
      id: session.id,
      exam_id: session.exam_id,
      student_name: session.student_name,
      participant_number: session.participant_number,
      class_name: session.class_name,
      status: session.status,
      started_at: session.started_at,
      expires_at: session.expires_at,
      remaining_seconds: remainingSeconds,
    },
    exam: {
      id: exam.id,
      title: exam.title,
      subject_name: exam.subject_name,
      duration_minutes: exam.duration_minutes,
      allow_audio_replay: exam.allow_audio_replay,
      max_audio_replays: exam.max_audio_replays,
    },
    questions,
    savedAnswers,
    audioPlayCounts,
  });
});

// Get session summary/result after submission (no answer keys exposed unless completed)
router.get('/session/:sessionId/summary', (req, res) => {
  const sessionId = Number(req.params.sessionId);
  const db = getDb();
  const session = db
    .prepare(
      `SELECT es.*, e.title as exam_title, e.duration_minutes, s.name as subject_name, u.full_name as teacher_name
       FROM exam_sessions es
       JOIN exams e ON e.id = es.exam_id
       JOIN subjects s ON s.id = e.subject_id
       JOIN users u ON u.id = e.teacher_user_id
       WHERE es.id = ?`
    )
    .get(sessionId) as Record<string, unknown> | undefined;

  if (!session) {
    res.status(404).json({ error: 'Hasil sesi tidak ditemukan.' });
    return;
  }

  const questionOrder = JSON.parse(String(session.question_order_json || '[]')) as number[];
  const answers = db
    .prepare(`SELECT question_id, answer_json, is_correct, score_awarded, max_score FROM student_answers WHERE session_id = ?`)
    .all(sessionId) as Array<{
    question_id: number;
    answer_json: string;
    is_correct: number | null;
    score_awarded: number;
    max_score: number;
  }>;

  let answeredCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let essayPendingCount = 0;

  for (const a of answers) {
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
      (typeof val === 'object' && val !== null && Object.keys(val).length === 0);

    if (!isEmpty) answeredCount += 1;
    if (a.is_correct === 1) correctCount += 1;
    else if (a.is_correct === 0 && !isEmpty) incorrectCount += 1;
    else if (a.is_correct === null && !isEmpty) essayPendingCount += 1;
  }

  const totalQuestions = questionOrder.length;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  res.json({
    summary: {
      session_id: session.id,
      exam_title: session.exam_title,
      subject_name: session.subject_name,
      teacher_name: session.teacher_name,
      student_name: session.student_name,
      participant_number: session.participant_number,
      class_name: session.class_name,
      status: session.status,
      started_at: session.started_at,
      submitted_at: session.submitted_at,
      total_score: session.total_score,
      max_score: session.max_score,
      auto_graded_score: session.auto_graded_score,
      essay_score: session.essay_score,
      violation_count: session.violation_count,
      total_questions: totalQuestions,
      answered_count: answeredCount,
      unanswered_count: unansweredCount,
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      essay_pending_count: essayPendingCount,
    },
  });
});

// Auto-save single or batch answer
router.post('/:id/answers', (req, res) => {
  const examId = Number(req.params.id);
  const { session_id, question_id, answer, audio_play_count } = req.body as {
    session_id?: number;
    question_id?: number;
    answer?: unknown;
    audio_play_count?: number;
  };

  if (!session_id || !question_id) {
    res.status(400).json({ error: 'session_id dan question_id wajib diisi.' });
    return;
  }

  const db = getDb();
  const session = db
    .prepare(`SELECT id, status, expires_at, question_order_json FROM exam_sessions WHERE id = ? AND exam_id = ?`)
    .get(Number(session_id), examId) as
    | { id: number; status: string; expires_at: string | null; question_order_json: string }
    | undefined;

  if (!session) {
    res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    return;
  }

  if (session.status !== 'IN_PROGRESS') {
    res.status(409).json({ error: 'Sesi ujian sudah berakhir.' });
    return;
  }

  // Allow 10 seconds grace for network latency on auto-submit
  if (session.expires_at && Date.now() > new Date(session.expires_at).getTime() + 10000) {
    const scores = recalculateSessionScores(session.id, db);
    db.prepare(
      `UPDATE exam_sessions SET status = 'AUTO_SUBMITTED', submitted_at = datetime('now') WHERE id = ?`
    ).run(session.id);
    broadcastMonitoringEvent(examId, 'session:submitted', {
      sessionId: session.id,
      status: 'AUTO_SUBMITTED',
      ...scores,
    });
    res.status(410).json({ error: 'Waktu ujian telah habis.', autoSubmitted: true });
    return;
  }

  const ansStr = JSON.stringify(answer === undefined ? null : answer);
  db.prepare(
    `INSERT INTO student_answers (session_id, question_id, answer_json, audio_play_count, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(session_id, question_id) DO UPDATE SET
       answer_json = excluded.answer_json,
       audio_play_count = COALESCE(?, student_answers.audio_play_count),
       updated_at = datetime('now')`
  ).run(session.id, Number(question_id), ansStr, audio_play_count ?? 0, audio_play_count ?? null);

  db.prepare(`UPDATE exam_sessions SET last_heartbeat_at = datetime('now') WHERE id = ?`).run(session.id);

  // Count answered questions for live monitoring
  const allAns = db
    .prepare(`SELECT answer_json FROM student_answers WHERE session_id = ?`)
    .all(session.id) as Array<{ answer_json: string }>;
  const answeredCount = allAns.filter((r) => {
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

  const totalQuestions = (JSON.parse(session.question_order_json || '[]') as number[]).length;
  const remainingSeconds = session.expires_at
    ? Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000))
    : 0;

  broadcastMonitoringEvent(examId, 'session:progress', {
    sessionId: session.id,
    answeredCount,
    unansweredCount: Math.max(0, totalQuestions - answeredCount),
    remainingSeconds,
  });

  res.json({ saved: true, answeredCount, remainingSeconds });
});

// Submit exam (manual or auto-submit)
router.post('/:id/submit', (req, res) => {
  const examId = Number(req.params.id);
  const { session_id, is_auto } = req.body as { session_id?: number; is_auto?: boolean };

  if (!session_id) {
    res.status(400).json({ error: 'session_id wajib diisi.' });
    return;
  }

  const db = getDb();
  const session = db
    .prepare(`SELECT * FROM exam_sessions WHERE id = ? AND exam_id = ?`)
    .get(Number(session_id), examId) as { id: number; status: string } | undefined;

  if (!session) {
    res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    return;
  }

  // Prevent duplicate submission while returning idempotent success
  if (session.status === 'SUBMITTED' || session.status === 'AUTO_SUBMITTED') {
    res.json({ alreadySubmitted: true, sessionId: session.id });
    return;
  }

  const finalStatus = is_auto ? 'AUTO_SUBMITTED' : 'SUBMITTED';
  const scores = db.transaction(() => {
    const s = recalculateSessionScores(session.id, db);
    db.prepare(
      `UPDATE exam_sessions SET status = ?, submitted_at = datetime('now') WHERE id = ?`
    ).run(finalStatus, session.id);
    return s;
  })();

  broadcastMonitoringEvent(examId, 'session:submitted', {
    sessionId: session.id,
    status: finalStatus,
    ...scores,
  });

  res.json({
    submitted: true,
    status: finalStatus,
    sessionId: session.id,
    ...scores,
  });
});

export default router;
