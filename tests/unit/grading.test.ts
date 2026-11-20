import { describe, expect, it } from 'vitest';
import { gradeQuestionAnswer } from '../../server/services/gradingService.ts';

describe('Automatic Grading Engine — All 5 Question Types', () => {
  it('grades MULTIPLE_CHOICE accurately', () => {
    const q = {
      id: 1,
      question_type: 'MULTIPLE_CHOICE' as const,
      correct_answer_json: JSON.stringify({ correctKey: 'B' }),
      partial_credit: 0,
      default_score: 10,
    };

    expect(gradeQuestionAnswer(q, 'B')).toEqual({ isCorrect: true, scoreAwarded: 10, maxScore: 10 });
    expect(gradeQuestionAnswer(q, 'A')).toEqual({ isCorrect: false, scoreAwarded: 0, maxScore: 10 });
    expect(gradeQuestionAnswer(q, null)).toEqual({ isCorrect: false, scoreAwarded: 0, maxScore: 10 });
  });

  it('grades MULTIPLE_SELECT with full and partial credit', () => {
    const q = {
      id: 2,
      question_type: 'MULTIPLE_SELECT' as const,
      correct_answer_json: JSON.stringify({ correctKeys: ['A', 'C'] }),
      partial_credit: 1,
      default_score: 10,
    };

    expect(gradeQuestionAnswer(q, ['A', 'C'])).toEqual({ isCorrect: true, scoreAwarded: 10, maxScore: 10 });
    expect(gradeQuestionAnswer(q, ['A'])).toEqual({ isCorrect: false, scoreAwarded: 5, maxScore: 10 });
    expect(gradeQuestionAnswer(q, ['A', 'B'])).toEqual({ isCorrect: false, scoreAwarded: 0, maxScore: 10 });
  });

  it('grades TRUE_FALSE accurately', () => {
    const q = {
      id: 3,
      question_type: 'TRUE_FALSE' as const,
      correct_answer_json: JSON.stringify({ correctValue: 'TRUE' }),
      partial_credit: 0,
      default_score: 10,
    };

    expect(gradeQuestionAnswer(q, 'TRUE')).toEqual({ isCorrect: true, scoreAwarded: 10, maxScore: 10 });
    expect(gradeQuestionAnswer(q, 'FALSE')).toEqual({ isCorrect: false, scoreAwarded: 0, maxScore: 10 });
  });

  it('grades MATCHING with individual pair scoring', () => {
    const q = {
      id: 4,
      question_type: 'MATCHING' as const,
      correct_answer_json: JSON.stringify({ pairs: { '1': 'B', '2': 'C', '3': 'A' } }),
      partial_credit: 1,
      default_score: 30,
      matching_pairs: [
        { pair_key: '1', right_key: 'B', score: 10 },
        { pair_key: '2', right_key: 'C', score: 10 },
        { pair_key: '3', right_key: 'A', score: 10 },
      ],
    };

    expect(gradeQuestionAnswer(q, { '1': 'B', '2': 'C', '3': 'A' })).toEqual({
      isCorrect: true,
      scoreAwarded: 30,
      maxScore: 30,
    });
    expect(gradeQuestionAnswer(q, { '1': 'B', '2': 'A', '3': 'C' })).toEqual({
      isCorrect: false,
      scoreAwarded: 10,
      maxScore: 30,
    });
  });

  it('leaves ESSAY for manual grading without auto score', () => {
    const q = {
      id: 5,
      question_type: 'ESSAY' as const,
      correct_answer_json: JSON.stringify({ manualGrading: true }),
      partial_credit: 0,
      default_score: 20,
    };

    expect(gradeQuestionAnswer(q, 'Learning English opens global opportunities.')).toEqual({
      isCorrect: null,
      scoreAwarded: 0,
      maxScore: 20,
    });
  });
});
