import type Database from 'better-sqlite3';
import { getDb } from '../database/db.ts';

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'MULTIPLE_SELECT'
  | 'MATCHING'
  | 'TRUE_FALSE'
  | 'ESSAY';

export interface GradeResult {
  isCorrect: boolean | null; // null for essay until manually graded
  scoreAwarded: number;
  maxScore: number;
}

export interface QuestionForGrading {
  id: number;
  question_type: QuestionType;
  correct_answer_json: string;
  partial_credit: number;
  default_score: number;
  score_override?: number | null;
  matching_pairs?: Array<{ pair_key: string; right_key: string; score: number }>;
}

export function gradeQuestionAnswer(
  question: QuestionForGrading,
  studentAnswer: unknown
): GradeResult {
  const maxScore = question.score_override ?? question.default_score;

  let correctData: Record<string, unknown> = {};
  try {
    correctData = JSON.parse(question.correct_answer_json || '{}') as Record<string, unknown>;
  } catch {
    correctData = {};
  }

  if (studentAnswer === null || studentAnswer === undefined || studentAnswer === '') {
    if (question.question_type === 'ESSAY') {
      return { isCorrect: null, scoreAwarded: 0, maxScore };
    }
    return { isCorrect: false, scoreAwarded: 0, maxScore };
  }

  switch (question.question_type) {
    case 'MULTIPLE_CHOICE': {
      const expected = String(correctData.correctKey || '').trim().toUpperCase();
      const actual = String(studentAnswer).trim().toUpperCase();
      const isCorrect = expected !== '' && actual === expected;
      return {
        isCorrect,
        scoreAwarded: isCorrect ? maxScore : 0,
        maxScore,
      };
    }

    case 'TRUE_FALSE': {
      const expected = String(correctData.correctValue || '').trim().toUpperCase();
      const actual = String(studentAnswer).trim().toUpperCase();
      const isCorrect = expected !== '' && actual === expected;
      return {
        isCorrect,
        scoreAwarded: isCorrect ? maxScore : 0,
        maxScore,
      };
    }

    case 'MULTIPLE_SELECT': {
      const expectedKeys = Array.isArray(correctData.correctKeys)
        ? correctData.correctKeys.map((k) => String(k).trim().toUpperCase())
        : [];
      const actualKeys = Array.isArray(studentAnswer)
        ? Array.from(new Set(studentAnswer.map((k) => String(k).trim().toUpperCase())))
        : [];

      if (expectedKeys.length === 0 || actualKeys.length === 0) {
        return { isCorrect: false, scoreAwarded: 0, maxScore };
      }

      const expectedSet = new Set(expectedKeys);
      const correctChosen = actualKeys.filter((k) => expectedSet.has(k)).length;
      const wrongChosen = actualKeys.filter((k) => !expectedSet.has(k)).length;
      const exactMatch =
        correctChosen === expectedSet.size && wrongChosen === 0 && actualKeys.length === expectedSet.size;

      if (exactMatch) {
        return { isCorrect: true, scoreAwarded: maxScore, maxScore };
      }

      if (question.partial_credit === 1) {
        const netCorrect = Math.max(0, correctChosen - wrongChosen);
        const ratio = netCorrect / expectedSet.size;
        const awarded = Math.round(maxScore * ratio * 100) / 100;
        return { isCorrect: false, scoreAwarded: awarded, maxScore };
      }

      return { isCorrect: false, scoreAwarded: 0, maxScore };
    }

    case 'MATCHING': {
      const pairs = question.matching_pairs ?? [];
      const expectedMap: Record<string, string> = {};
      let sumPairScores = 0;

      if (pairs.length > 0) {
        for (const p of pairs) {
          expectedMap[String(p.pair_key).trim()] = String(p.right_key).trim().toUpperCase();
          sumPairScores += Number(p.score || 0);
        }
      } else if (correctData.pairs && typeof correctData.pairs === 'object') {
        for (const [k, v] of Object.entries(correctData.pairs as Record<string, string>)) {
          expectedMap[String(k).trim()] = String(v).trim().toUpperCase();
        }
      }

      const effectiveMaxScore =
        question.score_override != null
          ? question.score_override
          : sumPairScores > 0
            ? sumPairScores
            : maxScore;

      const actualMap =
        typeof studentAnswer === 'object' && studentAnswer !== null
          ? (studentAnswer as Record<string, string>)
          : {};

      const keys = Object.keys(expectedMap);
      if (keys.length === 0) {
        return { isCorrect: false, scoreAwarded: 0, maxScore: effectiveMaxScore };
      }

      let awarded = 0;
      let correctCount = 0;

      if (pairs.length > 0 && sumPairScores > 0 && question.score_override == null) {
        for (const p of pairs) {
          const pk = String(p.pair_key).trim();
          const expectedRight = String(p.right_key).trim().toUpperCase();
          const actualRight = String(actualMap[pk] || '').trim().toUpperCase();
          if (actualRight === expectedRight) {
            awarded += Number(p.score || 0);
            correctCount += 1;
          }
        }
      } else {
        const perPairScore = effectiveMaxScore / keys.length;
        for (const k of keys) {
          const actualRight = String(actualMap[k] || '').trim().toUpperCase();
          if (actualRight === expectedMap[k]) {
            awarded += perPairScore;
            correctCount += 1;
          }
        }
      }

      awarded = Math.round(awarded * 100) / 100;
      return {
        isCorrect: correctCount === keys.length,
        scoreAwarded: awarded,
        maxScore: effectiveMaxScore,
      };
    }

    case 'ESSAY': {
      return {
        isCorrect: null,
        scoreAwarded: 0,
        maxScore,
      };
    }
  }
}

export function recalculateSessionScores(sessionId: number, targetDb?: Database.Database): {
  totalScore: number;
  maxScore: number;
  autoGradedScore: number;
  essayScore: number;
} {
  const db = targetDb ?? getDb();

  const session = db
    .prepare(`SELECT id, exam_id, question_order_json FROM exam_sessions WHERE id = ?`)
    .get(sessionId) as { id: number; exam_id: number; question_order_json: string } | undefined;

  if (!session) {
    throw new Error('Session not found');
  }

  let orderedIds: number[] = [];
  try {
    orderedIds = JSON.parse(session.question_order_json || '[]') as number[];
  } catch {
    orderedIds = [];
  }

  const examQuestions = db
    .prepare(
      `SELECT q.id, q.question_type, q.correct_answer_json, q.partial_credit, q.default_score, eq.score_override
       FROM exam_questions eq
       JOIN questions q ON q.id = eq.question_id
       WHERE eq.exam_id = ?`
    )
    .all(session.exam_id) as QuestionForGrading[];

  const relevantQuestions =
    orderedIds.length > 0
      ? examQuestions.filter((q) => orderedIds.includes(q.id))
      : examQuestions;

  let totalMax = 0;
  let autoScore = 0;
  let essayScore = 0;

  const upsertAnswer = db.prepare(
    `INSERT INTO student_answers (session_id, question_id, answer_json, is_correct, score_awarded, max_score, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(session_id, question_id) DO UPDATE SET
       is_correct = excluded.is_correct,
       score_awarded = excluded.score_awarded,
       max_score = excluded.max_score`
  );

  for (const q of relevantQuestions) {
    const pairs =
      q.question_type === 'MATCHING'
        ? (db
            .prepare(`SELECT pair_key, right_key, score FROM matching_pairs WHERE question_id = ? ORDER BY sort_order`)
            .all(q.id) as Array<{ pair_key: string; right_key: string; score: number }>)
        : [];

    const existingAnsRow = db
      .prepare(`SELECT answer_json FROM student_answers WHERE session_id = ? AND question_id = ?`)
      .get(sessionId, q.id) as { answer_json: string } | undefined;

    let parsedAnswer: unknown = null;
    if (existingAnsRow) {
      try {
        parsedAnswer = JSON.parse(existingAnsRow.answer_json);
      } catch {
        parsedAnswer = null;
      }
    }

    const graded = gradeQuestionAnswer({ ...q, matching_pairs: pairs }, parsedAnswer);
    totalMax += graded.maxScore;

    if (q.question_type === 'ESSAY') {
      const essayGradeRow = db
        .prepare(`SELECT score_awarded FROM essay_grades WHERE session_id = ? AND question_id = ?`)
        .get(sessionId, q.id) as { score_awarded: number } | undefined;
      const awarded = essayGradeRow ? Number(essayGradeRow.score_awarded) : 0;
      essayScore += awarded;
      if (existingAnsRow) {
        upsertAnswer.run(
          sessionId,
          q.id,
          existingAnsRow.answer_json,
          essayGradeRow ? (awarded >= graded.maxScore * 0.5 ? 1 : 0) : null,
          awarded,
          graded.maxScore
        );
      }
    } else {
      autoScore += graded.scoreAwarded;
      upsertAnswer.run(
        sessionId,
        q.id,
        existingAnsRow ? existingAnsRow.answer_json : 'null',
        graded.isCorrect ? 1 : 0,
        graded.scoreAwarded,
        graded.maxScore
      );
    }
  }

  const totalScore = Math.round((autoScore + essayScore) * 100) / 100;
  totalMax = Math.round(totalMax * 100) / 100;

  db.prepare(
    `UPDATE exam_sessions
     SET total_score = ?, max_score = ?, auto_graded_score = ?, essay_score = ?
     WHERE id = ?`
  ).run(totalScore, totalMax, Math.round(autoScore * 100) / 100, Math.round(essayScore * 100) / 100, sessionId);

  return {
    totalScore,
    maxScore: totalMax,
    autoGradedScore: Math.round(autoScore * 100) / 100,
    essayScore: Math.round(essayScore * 100) / 100,
  };
}
