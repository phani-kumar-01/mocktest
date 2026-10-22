import { z } from 'zod';
import { OptionKeySchema } from './question.js';

export const JoinPolicySchema = z.enum(['FIXED_END', 'FULL_DURATION']);
export type JoinPolicy = z.infer<typeof JoinPolicySchema>;

export const ExamStatusSchema = z.enum(['draft', 'scheduled', 'live', 'ended']);
export type ExamStatus = z.infer<typeof ExamStatusSchema>;

export const AttemptStatusSchema = z.enum(['in_progress', 'submitted', 'auto_submitted']);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

export const GradeTierSchema = z.object({
  min: z.number(),
  label: z.string()
});
export type GradeTier = z.infer<typeof GradeTierSchema>;

export const CreateExamSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subjectId: z.string().uuid('Valid subject ID required'),
  scheduledStart: z.string().datetime().optional().nullable(),
  autoStart: z.boolean().optional().default(false),
  durationMinutes: z.number().int().positive('Duration must be positive').default(60),
  joinPolicy: JoinPolicySchema.default('FIXED_END'),
  lateJoinCutoffMinutes: z.number().int().min(0).optional().nullable(),
  hardCloseAt: z.string().datetime().optional().nullable(),
  questionsPerStudent: z.number().int().positive().default(50),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  negativeMarking: z.boolean().default(false),
  batchFilter: z.string().optional().nullable(),
  assignmentMarks: z.number().min(0).default(0),
  assignmentMax: z.number().positive().default(25),
  examMax: z.number().positive().default(75),
  passTotal: z.number().min(0).default(40),
  passAssignmentMin: z.number().min(0).default(10),
  passExamMin: z.number().min(0).default(30),
  strongThreshold: z.number().min(0).max(100).default(70),
  weakThreshold: z.number().min(0).max(100).default(50),
  gradeTiers: z.array(GradeTierSchema).optional()
});
export type CreateExamInput = z.infer<typeof CreateExamSchema>;

export const UpdateExamSchema = CreateExamSchema.partial();
export type UpdateExamInput = z.infer<typeof UpdateExamSchema>;

export const ExtendExamSchema = z.object({
  minutes: z.number().int().positive('Minutes to extend must be positive')
});
export type ExtendExamInput = z.infer<typeof ExtendExamSchema>;

export const StudentHomeResponseSchema = z.object({
  state: z.enum(['idle', 'live', 'submitted']),
  exam: z.object({
    id: z.string(),
    title: z.string(),
    durationMinutes: z.number(),
    canEnter: z.boolean(),
    reason: z.string().optional(),
    remainingSeconds: z.number().optional()
  }).optional(),
  attemptId: z.string().optional(),
  alreadySubmitted: z.boolean().optional()
});
export type StudentHomeResponse = z.infer<typeof StudentHomeResponseSchema>;

export interface StudentQuestionItem {
  index: number;
  qid: string;
  bodyMd: string;
  codeSnippet?: string | null;
  codeLang?: string | null;
  options: { key: string; text: string }[];
}

export interface StudentAttemptResponse {
  serverTime: string;
  deadlineAt: string;
  remainingSeconds: number;
  status: AttemptStatus;
  questions: StudentQuestionItem[];
  answers: Record<string, string | null>;
  tabSwitches?: number;
}

export const SaveAnswerSchema = z.object({
  chosen: OptionKeySchema.nullable()
});
export type SaveAnswerInput = z.infer<typeof SaveAnswerSchema>;
