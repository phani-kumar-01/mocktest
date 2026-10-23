import { z } from 'zod';
import { AttemptStatus } from './exam.js';

export const CreateStudentSchema = z.object({
  rollNo: z.string().min(1, 'Roll number is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  batch: z.string().optional().default('default')
});
export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;

export const UpdateStudentSchema = CreateStudentSchema.partial();
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;

export const StudentImportRowSchema = z.object({
  roll_no: z.string().min(1, 'Roll number is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  batch: z.string().optional().default('default')
});
export type StudentImportRow = z.infer<typeof StudentImportRowSchema>;

export interface MonitorStudentRow {
  studentId: string;
  rollNo: string;
  name: string;
  status: 'not_joined' | AttemptStatus;
  answeredCount: number;
  totalQuestions: number;
  lastSavedAt?: string | null;
  tabSwitches: number;
  securityViolations?: number;
  isSafeBrowser?: boolean;
  deadlineAt?: string | null;
  attemptId?: string | null;
}

export interface MonitorResponse {
  examId: string;
  examTitle: string;
  examStatus: string;
  counts: {
    eligible: number;
    notJoined: number;
    inProgress: number;
    submitted: number;
  };
  students: MonitorStudentRow[];
}

export interface MailStatusResponse {
  examId: string;
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  students: {
    studentId: string;
    rollNo: string;
    name: string;
    email: string | null;
    status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
    lastError?: string | null;
  }[];
}
