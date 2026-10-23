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

export interface StudentDetailedQuestion {
  questionId: string;
  index: number;
  topic: string;
  subtopic?: string;
  bodyMd: string;
  codeSnippet?: string | null;
  codeLang?: string | null;
  options: { key: string; text: string }[];
  studentAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  marksAwarded: number;
  explanationMd?: string | null;
}

export interface AttemptMetadata {
  attemptId: string;
  startedAt: string;
  submittedAt: string | null;
  status: string;
  tabSwitches: number;
  securityViolations: number;
  isSafeBrowser: boolean;
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
  goodAtTopics: {
    topic: string;
    subtopic?: string;
    pct: number;
    correct: number;
    total: number;
  }[];
  leftToLearnTopics: {
    topic: string;
    subtopic?: string;
    pct: number;
    correct: number;
    total: number;
    recommendation: string;
  }[];
  topicScores: TopicScoreItem[];
  focusAreas: {
    topic: string;
    subtopic: string;
    level: PerformanceLevel;
    pct: number;
    recommendation: string;
  }[];
  wrongQuestions: StudentWrongQuestion[];
  allQuestions?: StudentDetailedQuestion[];
  attemptMeta?: AttemptMetadata;
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
  goodAtTopics?: string[];
  leftToLearnTopics?: string[];
  topicScores?: { topic: string; pct: number; level: PerformanceLevel }[];
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
