import { sql, directSql } from './client.js';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_no text UNIQUE NOT NULL,
  name text NOT NULL,
  email text,
  batch text,
  password_hash text NOT NULL,
  must_change_password boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type text NOT NULL CHECK (user_type IN ('student','admin')),
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS sessions_user_type_user_id_idx ON sessions (user_type, user_id);

CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES subjects(id),
  filename text,
  row_count int,
  created_by uuid REFERENCES admins(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id),
  import_batch_id uuid REFERENCES import_batches(id),
  topic text NOT NULL,
  subtopic text,
  group_id text,
  paragraph text,
  concept text,
  set_name text,
  body_md text NOT NULL,
  code_snippet text,
  code_lang text DEFAULT 'python',
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct char(1) NOT NULL CHECK (correct IN ('a','b','c','d')),
  marks numeric DEFAULT 1,
  negative numeric DEFAULT 0,
  explanation_md text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_subject_topic_idx ON questions (subject_id, topic);
CREATE INDEX IF NOT EXISTS questions_group_idx ON questions (group_id);

CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject_id uuid NOT NULL REFERENCES subjects(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','live','ended')),
  scheduled_start timestamptz,
  auto_start boolean DEFAULT false,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes int NOT NULL DEFAULT 60,
  extra_minutes int NOT NULL DEFAULT 0,
  join_policy text NOT NULL DEFAULT 'FIXED_END' CHECK (join_policy IN ('FIXED_END','FULL_DURATION')),
  late_join_cutoff_minutes int,
  hard_close_at timestamptz,
  questions_per_student int NOT NULL DEFAULT 50,
  shuffle_questions boolean DEFAULT true,
  shuffle_options boolean DEFAULT true,
  negative_marking boolean DEFAULT false,
  batch_filter text,
  assignment_marks numeric DEFAULT 0,
  assignment_max numeric DEFAULT 25,
  exam_max numeric DEFAULT 75,
  pass_total numeric DEFAULT 40,
  pass_assignment_min numeric DEFAULT 10,
  pass_exam_min numeric DEFAULT 30,
  strong_threshold numeric DEFAULT 70,
  weak_threshold numeric DEFAULT 50,
  grade_tiers jsonb DEFAULT '[{"min":90,"label":"Elite + Gold"},{"min":75,"label":"Elite + Silver"},{"min":60,"label":"Elite"},{"min":40,"label":"Successfully Completed"}]',
  results_published boolean DEFAULT false,
  created_by uuid REFERENCES admins(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_questions (
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id),
  PRIMARY KEY (exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id),
  student_id uuid NOT NULL REFERENCES students(id),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','auto_submitted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  seed bigint NOT NULL,
  question_order jsonb NOT NULL,
  tab_switches int DEFAULT 0,
  UNIQUE (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS attempts_exam_status_idx ON attempts (exam_id, status);

CREATE TABLE IF NOT EXISTS answers (
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id),
  chosen char(1) CHECK (chosen IN ('a','b','c','d')),
  saved_at timestamptz DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS results (
  attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exams(id),
  student_id uuid NOT NULL REFERENCES students(id),
  correct_count int, wrong_count int, unanswered_count int,
  raw_score numeric, max_raw numeric,
  exam_scaled numeric, assignment_marks numeric, total numeric,
  passed boolean, grade_label text,
  computed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topic_scores (
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE,
  topic text NOT NULL,
  subtopic text NOT NULL DEFAULT '',
  correct int, total int, pct numeric,
  level text CHECK (level IN ('strong','average','weak')),
  PRIMARY KEY (attempt_id, topic, subtopic)
);

CREATE TABLE IF NOT EXISTS mail_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id),
  student_id uuid NOT NULL REFERENCES students(id),
  to_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  tries int DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor text, action text, details jsonb, at timestamptz DEFAULT now()
);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS group_id text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS paragraph text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS concept text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS set_name text;
CREATE INDEX IF NOT EXISTS questions_group_idx ON questions (group_id);

ALTER TABLE exams ADD COLUMN IF NOT EXISTS parent_exam_id uuid REFERENCES exams(id);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS instance_number integer DEFAULT 1;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS require_safe_browser boolean DEFAULT true;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS is_safe_browser boolean DEFAULT true;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS security_violations integer DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS client_meta jsonb;
`;

export async function migrate() {
  console.log('Running database migrations...');
  const migrator = directSql || sql;
  if (typeof (migrator as any).exec === 'function') {
    await (migrator as any).exec(SCHEMA_SQL);
  } else if (typeof (migrator as any).query === 'function') {
    await (migrator as any).query(SCHEMA_SQL);
  } else {
    await (migrator as any).unsafe(SCHEMA_SQL);
  }
  console.log('Database migrations completed successfully.');
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  migrate().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
