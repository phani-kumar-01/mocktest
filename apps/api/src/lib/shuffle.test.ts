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

  it('preserves group clusters: questions within the same group appear consecutively even when jumbled', () => {
    // 3 groups with 5 questions each (like G01, G02, G03)
    const pool = [
      { id: 'g1-q1', groupId: 'G01' },
      { id: 'g1-q2', groupId: 'G01' },
      { id: 'g1-q3', groupId: 'G01' },
      { id: 'g1-q4', groupId: 'G01' },
      { id: 'g1-q5', groupId: 'G01' },
      { id: 'g2-q1', groupId: 'G02' },
      { id: 'g2-q2', groupId: 'G02' },
      { id: 'g2-q3', groupId: 'G02' },
      { id: 'g2-q4', groupId: 'G02' },
      { id: 'g2-q5', groupId: 'G02' },
      { id: 'g3-q1', groupId: 'G03' },
      { id: 'g3-q2', groupId: 'G03' },
      { id: 'g3-q3', groupId: 'G03' },
      { id: 'g3-q4', groupId: 'G03' },
      { id: 'g3-q5', groupId: 'G03' }
    ];

    // Test across 10 different student seeds
    for (let s = 1; s <= 10; s++) {
      const res = generateQuestionOrder({
        examId: 'exam-group-test',
        studentId: `student-${s}`,
        poolQuestions: pool,
        questionsPerStudent: 15,
        shuffleQuestions: true
      });

      const orderIds = res.questionOrder.map(q => q.qid);
      expect(orderIds.length).toBe(15);

      // Verify each group appears in a continuous 5-question block
      for (const gid of ['g1', 'g2', 'g3']) {
        const indices = orderIds
          .map((id, idx) => (id.startsWith(gid) ? idx : -1))
          .filter(idx => idx !== -1);
        expect(indices.length).toBe(5);
        // Verify all 5 indices are contiguous (e.g. 0,1,2,3,4 or 5,6,7,8,9 or 10,11,12,13,14)
        for (let i = 1; i < indices.length; i++) {
          expect(indices[i]).toBe(indices[i - 1] + 1);
        }
      }
    }
  });
});
