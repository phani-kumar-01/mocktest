import { z } from 'zod';

export type PerformanceLevel = 'strong' | 'average' | 'weak';

export interface TopicScoreItem {
  topic: string;
  subtopic: string;
  correct: number;
  total: number;
  pct: number;
  level: PerformanceLevel;
  fewQuestions?: boolean;
}

export interface StudentWrongQuestion {
  questionId: string;
  topic: string;
  subtopic?: string;
  bodyMd: string;
  codeSnippet?: string | null;
  codeLang?: string | null;
  studentAnswer: string | null;
  correctAnswer: string;
  explanationMd?: string | null;
}

export interface StudentAnalysisResponse {
  examId: string;
  examTitle: string;
  studentId: string;
  rollNo: string;
  studentName: string;
  assignmentMarks: number;
  assignmentMax: number;
  examScaled: number;
  examMax: number;
  total: number;
  passed: boolean;
  gradeLabel: string;
  topicScores: TopicScoreItem[];
  focusAreas: {
    topic: string;
    subtopic: string;
    level: PerformanceLevel;
    pct: number;
    recommendation: string;
  }[];
  wrongQuestions: StudentWrongQuestion[];
}

export interface ExamResultsSummary {
  totalAttempts: number;
  passedCount: number;
  passRate: number;
  avgTotal: number;
  medianTotal: number;
  highestTotal: number;
  lowestTotal: number;
  distribution: { bin: string; count: number }[];
}

export interface ExamResultRow {
  studentId: string;
  rollNo: string;
  name: string;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  rawScore: number;
  maxRaw: number;
  examScaled: number;
  assignmentMarks: number;
  total: number;
  passed: boolean;
  gradeLabel: string;
}

export const UpdateScoringSchema = z.object({
  assignmentMarks: z.number().min(0).optional(),
  passTotal: z.number().min(0).optional(),
  passAssignmentMin: z.number().min(0).optional(),
  passExamMin: z.number().min(0).optional(),
  strongThreshold: z.number().min(0).max(100).optional(),
  weakThreshold: z.number().min(0).max(100).optional()
});
export type UpdateScoringInput = z.infer<typeof UpdateScoringSchema>;
