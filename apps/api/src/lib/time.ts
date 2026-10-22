import { JoinPolicy } from '@nptel/shared';

export interface ExamTimeConfig {
  status: string; // 'draft' | 'scheduled' | 'live' | 'ended'
  startedAt: Date | null;
  durationMinutes: number;
  extraMinutes: number;
  joinPolicy: JoinPolicy;
  lateJoinCutoffMinutes?: number | null;
  hardCloseAt?: Date | null;
}

export interface CanEnterResult {
  canEnter: boolean;
  reason?: string;
}

/**
 * Check whether a student can enter the exam at current server time
 */
export function checkCanEnterExam(exam: ExamTimeConfig, now: Date = new Date()): CanEnterResult {
  if (exam.status !== 'live' || !exam.startedAt) {
    return {
      canEnter: false,
      reason: exam.status === 'ended' ? 'Exam has ended' : 'Exam is not currently live'
    };
  }

  const startTimeMs = exam.startedAt.getTime();
  const nowMs = now.getTime();

  // Check late join cutoff
  if (exam.lateJoinCutoffMinutes != null && exam.lateJoinCutoffMinutes >= 0) {
    const cutoffTimeMs = startTimeMs + exam.lateJoinCutoffMinutes * 60 * 1000;
    if (nowMs > cutoffTimeMs) {
      return {
        canEnter: false,
        reason: 'Late join cutoff time has passed'
      };
    }
  }

  // For FIXED_END, check if exam end time has already arrived
  if (exam.joinPolicy === 'FIXED_END') {
    const totalMinutes = exam.durationMinutes + exam.extraMinutes;
    const fixedEndMs = startTimeMs + totalMinutes * 60 * 1000;
    if (nowMs >= fixedEndMs) {
      return {
        canEnter: false,
        reason: 'Exam duration has completed'
      };
    }
  }

  // For hard close limit
  if (exam.hardCloseAt && nowMs >= exam.hardCloseAt.getTime()) {
    return {
      canEnter: false,
      reason: 'Hard close time reached'
    };
  }

  return { canEnter: true };
}

/**
 * Compute deadline for a newly created attempt
 */
export function calculateAttemptDeadline(exam: ExamTimeConfig, now: Date = new Date()): Date {
  const totalMinutes = exam.durationMinutes + exam.extraMinutes;

  if (exam.joinPolicy === 'FIXED_END') {
    const startedAt = exam.startedAt ? new Date(exam.startedAt) : now;
    return new Date(startedAt.getTime() + totalMinutes * 60 * 1000);
  }

  // FULL_DURATION: starts from current join time
  let deadlineMs = now.getTime() + totalMinutes * 60 * 1000;
  if (exam.hardCloseAt) {
    deadlineMs = Math.min(deadlineMs, exam.hardCloseAt.getTime());
  }

  return new Date(deadlineMs);
}

/**
 * Calculate remaining seconds until deadline
 */
export function calculateRemainingSeconds(deadlineAt: Date, now: Date = new Date()): number {
  const diffMs = deadlineAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}
