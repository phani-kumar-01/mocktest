import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  bigint,
  jsonb,
  primaryKey,
  unique,
  bigserial,
  index
} from 'drizzle-orm/pg-core';

export const admins = pgTable('admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').unique().notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const students = pgTable('students', {
  id: uuid('id').defaultRandom().primaryKey(),
  rollNo: text('roll_no').unique().notNull(),
  name: text('name').notNull(),
  email: text('email'),
  batch: text('batch'),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').default(false),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userType: text('user_type').notNull(), // 'student' | 'admin'
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked: boolean('revoked').default(false)
}, (table) => ({
  userTypeUserIdx: index('sessions_user_type_user_id_idx').on(table.userType, table.userId)
}));

export const subjects = pgTable('subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').unique().notNull()
});

export const importBatches = pgTable('import_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  subjectId: uuid('subject_id').references(() => subjects.id),
  filename: text('filename'),
  rowCount: integer('row_count'),
  createdBy: uuid('created_by').references(() => admins.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const questions = pgTable('questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id),
  importBatchId: uuid('import_batch_id').references(() => importBatches.id),
  topic: text('topic').notNull(),
  subtopic: text('subtopic'),
  bodyMd: text('body_md').notNull(),
  codeSnippet: text('code_snippet'),
  codeLang: text('code_lang').default('python'),
  optionA: text('option_a').notNull(),
  optionB: text('option_b').notNull(),
  optionC: text('option_c').notNull(),
  optionD: text('option_d').notNull(),
  correct: text('correct').notNull(), // 'a'|'b'|'c'|'d'
  marks: numeric('marks').default('1'),
  negative: numeric('negative').default('0'),
  explanationMd: text('explanation_md'),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  subjectTopicIdx: index('questions_subject_topic_idx').on(table.subjectId, table.topic)
}));

export const exams = pgTable('exams', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id),
  status: text('status').notNull().default('draft'), // 'draft'|'scheduled'|'live'|'ended'
  scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
  autoStart: boolean('auto_start').default(false),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes').notNull().default(60),
  extraMinutes: integer('extra_minutes').notNull().default(0),
  joinPolicy: text('join_policy').notNull().default('FIXED_END'), // 'FIXED_END'|'FULL_DURATION'
  lateJoinCutoffMinutes: integer('late_join_cutoff_minutes'),
  hardCloseAt: timestamp('hard_close_at', { withTimezone: true }),
  questionsPerStudent: integer('questions_per_student').notNull().default(50),
  shuffleQuestions: boolean('shuffle_questions').default(true),
  shuffleOptions: boolean('shuffle_options').default(true),
  negativeMarking: boolean('negative_marking').default(false),
  batchFilter: text('batch_filter'),
  assignmentMarks: numeric('assignment_marks').default('0'),
  assignmentMax: numeric('assignment_max').default('25'),
  examMax: numeric('exam_max').default('75'),
  passTotal: numeric('pass_total').default('40'),
  passAssignmentMin: numeric('pass_assignment_min').default('10'),
  passExamMin: numeric('pass_exam_min').default('30'),
  strongThreshold: numeric('strong_threshold').default('70'),
  weakThreshold: numeric('weak_threshold').default('50'),
  gradeTiers: jsonb('grade_tiers').default([
    { min: 90, label: 'Elite + Gold' },
    { min: 75, label: 'Elite + Silver' },
    { min: 60, label: 'Elite' },
    { min: 40, label: 'Successfully Completed' }
  ]),
  resultsPublished: boolean('results_published').default(false),
  createdBy: uuid('created_by').references(() => admins.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const examQuestions = pgTable('exam_questions', {
  examId: uuid('exam_id').references(() => exams.id, { onDelete: 'cascade' }).notNull(),
  questionId: uuid('question_id').references(() => questions.id).notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.examId, table.questionId] })
}));

export const attempts = pgTable('attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  examId: uuid('exam_id').notNull().references(() => exams.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  status: text('status').notNull().default('in_progress'), // 'in_progress'|'submitted'|'auto_submitted'
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  questionOrder: jsonb('question_order').notNull(), // [{ qid: string, options: string[] }]
  tabSwitches: integer('tab_switches').default(0)
}, (table) => ({
  examStudentUnique: unique().on(table.examId, table.studentId),
  examStatusIdx: index('attempts_exam_status_idx').on(table.examId, table.status)
}));

export const answers = pgTable('answers', {
  attemptId: uuid('attempt_id').references(() => attempts.id, { onDelete: 'cascade' }).notNull(),
  questionId: uuid('question_id').references(() => questions.id).notNull(),
  chosen: text('chosen'), // 'a'|'b'|'c'|'d'|null
  savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  pk: primaryKey({ columns: [table.attemptId, table.questionId] })
}));

export const results = pgTable('results', {
  attemptId: uuid('attempt_id').primaryKey().references(() => attempts.id, { onDelete: 'cascade' }),
  examId: uuid('exam_id').notNull().references(() => exams.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  correctCount: integer('correct_count'),
  wrongCount: integer('wrong_count'),
  unansweredCount: integer('unanswered_count'),
  rawScore: numeric('raw_score'),
  maxRaw: numeric('max_raw'),
  examScaled: numeric('exam_scaled'),
  assignmentMarks: numeric('assignment_marks'),
  total: numeric('total'),
  passed: boolean('passed'),
  gradeLabel: text('grade_label'),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow()
});

export const topicScores = pgTable('topic_scores', {
  attemptId: uuid('attempt_id').references(() => attempts.id, { onDelete: 'cascade' }).notNull(),
  topic: text('topic').notNull(),
  subtopic: text('subtopic').notNull().default(''),
  correct: integer('correct'),
  total: integer('total'),
  pct: numeric('pct'),
  level: text('level'), // 'strong'|'average'|'weak'
}, (table) => ({
  pk: primaryKey({ columns: [table.attemptId, table.topic, table.subtopic] })
}));

export const mailQueue = pgTable('mail_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  examId: uuid('exam_id').notNull().references(() => exams.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('pending'), // 'pending'|'sending'|'sent'|'failed'
  tries: integer('tries').default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true })
}, (table) => ({
  examStudentUnique: unique().on(table.examId, table.studentId)
}));

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actor: text('actor'),
  action: text('action'),
  details: jsonb('details'),
  at: timestamp('at', { withTimezone: true }).defaultNow()
});
