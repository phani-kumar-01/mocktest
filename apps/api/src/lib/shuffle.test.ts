import { describe, it, expect } from 'vitest';
import { generateQuestionOrder, hashStringToSeed, createMulberry32 } from './shuffle.js';

describe('Seeded Shuffle Algorithm', () => {
  it('deterministic: same examId and studentId produce exact same order', () => {
    const pool = Array.from({ length: 50 }, (_, i) => `q-${i + 1}`);
    const res1 = generateQuestionOrder({
      examId: 'exam-1',
      studentId: 'student-A',
      poolQuestionIds: pool,
      questionsPerStudent: 30
    });

    const res2 = generateQuestionOrder({
      examId: 'exam-1',
      studentId: 'student-A',
      poolQuestionIds: pool,
      questionsPerStudent: 30
    });

    expect(res1.seed).toBe(res2.seed);
    expect(res1.questionOrder).toEqual(res2.questionOrder);
  });

  it('different students get different question and option order', () => {
    const pool = Array.from({ length: 50 }, (_, i) => `q-${i + 1}`);
    const resA = generateQuestionOrder({
      examId: 'exam-1',
      studentId: 'student-A',
      poolQuestionIds: pool,
      questionsPerStudent: 50
    });

    const resB = generateQuestionOrder({
      examId: 'exam-1',
      studentId: 'student-B',
      poolQuestionIds: pool,
      questionsPerStudent: 50
    });

    expect(resA.seed).not.toBe(resB.seed);
    expect(resA.questionOrder).not.toEqual(resB.questionOrder);
  });

  it('all questions and options are preserved with no duplicates', () => {
    const pool = Array.from({ length: 20 }, (_, i) => `q-${i + 1}`);
    const res = generateQuestionOrder({
      examId: 'exam-1',
      studentId: 'student-X',
      poolQuestionIds: pool,
      questionsPerStudent: 20
    });

    expect(res.questionOrder.length).toBe(20);
    const qids = res.questionOrder.map(q => q.qid);
    expect(new Set(qids).size).toBe(20);

    for (const item of res.questionOrder) {
      expect(item.options.sort()).toEqual(['a', 'b', 'c', 'd']);
    }
  });
});
