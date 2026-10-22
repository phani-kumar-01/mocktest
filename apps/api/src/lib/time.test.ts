import { describe, it, expect } from 'vitest';
import { checkCanEnterExam, calculateAttemptDeadline, calculateRemainingSeconds } from './time.js';

describe('Deadline & Join Policy Time Calculation', () => {
  const startedAt = new Date('2026-10-22T10:00:00Z');

  describe('FIXED_END Policy', () => {
    it('10:00 exam (60 min) joined at 10:30 ends at 11:00', () => {
      const exam = {
        status: 'live',
        startedAt,
        durationMinutes: 60,
        extraMinutes: 0,
        joinPolicy: 'FIXED_END' as const
      };

      const joinTime = new Date('2026-10-22T10:30:00Z');
      const deadline = calculateAttemptDeadline(exam, joinTime);
      expect(deadline.toISOString()).toBe('2026-10-22T11:00:00.000Z');

      const remaining = calculateRemainingSeconds(deadline, joinTime);
      expect(remaining).toBe(30 * 60); // 30 minutes
    });

    it('rejects entry if now >= startedAt + duration + extra', () => {
      const exam = {
        status: 'live',
        startedAt,
        durationMinutes: 60,
        extraMinutes: 0,
        joinPolicy: 'FIXED_END' as const
      };

      const pastEnd = new Date('2026-10-22T11:00:01Z');
      const res = checkCanEnterExam(exam, pastEnd);
      expect(res.canEnter).toBe(false);
    });
  });

  describe('FULL_DURATION Policy', () => {
    it('10:00 exam (60 min) joined at 10:30 ends at 11:30', () => {
      const exam = {
        status: 'live',
        startedAt,
        durationMinutes: 60,
        extraMinutes: 0,
        joinPolicy: 'FULL_DURATION' as const
      };

      const joinTime = new Date('2026-10-22T10:30:00Z');
      const deadline = calculateAttemptDeadline(exam, joinTime);
      expect(deadline.toISOString()).toBe('2026-10-22T11:30:00.000Z');

      const remaining = calculateRemainingSeconds(deadline, joinTime);
      expect(remaining).toBe(60 * 60); // 60 full minutes
    });

    it('clamps deadline to hardCloseAt if configured', () => {
      const exam = {
        status: 'live',
        startedAt,
        durationMinutes: 60,
        extraMinutes: 0,
        joinPolicy: 'FULL_DURATION' as const,
        hardCloseAt: new Date('2026-10-22T11:15:00Z')
      };

      const joinTime = new Date('2026-10-22T10:30:00Z');
      const deadline = calculateAttemptDeadline(exam, joinTime);
      expect(deadline.toISOString()).toBe('2026-10-22T11:15:00.000Z');
    });
  });

  describe('Late Join Cutoff', () => {
    it('blocks entry if join time exceeds cutoff', () => {
      const exam = {
        status: 'live',
        startedAt,
        durationMinutes: 60,
        extraMinutes: 0,
        joinPolicy: 'FIXED_END' as const,
        lateJoinCutoffMinutes: 15
      };

      const allowedJoin = new Date('2026-10-22T10:14:59Z');
      expect(checkCanEnterExam(exam, allowedJoin).canEnter).toBe(true);

      const blockedJoin = new Date('2026-10-22T10:15:01Z');
      expect(checkCanEnterExam(exam, blockedJoin).canEnter).toBe(false);
    });
  });
});
