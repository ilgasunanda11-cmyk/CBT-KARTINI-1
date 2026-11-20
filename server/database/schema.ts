import type Database from 'better-sqlite3';
import { getDb } from './db.ts';

export function runMigrations(targetDb?: Database.Database): void {
  const db = targetDb ?? getDb();

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'TEACHER')),
      full_name TEXT NOT NULL,
      email TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      grade_level INTEGER NOT NULL DEFAULT 7,
      academic_year TEXT NOT NULL DEFAULT '2026/2027',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_number TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      gender TEXT DEFAULT 'L',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      nip TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      subject_ids_json TEXT NOT NULL DEFAULT '[]',
      class_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS question_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_shared INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('IMAGE', 'AUDIO')),
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      duration_seconds REAL DEFAULT 0,
      alt_text TEXT DEFAULT '',
      caption TEXT DEFAULT '',
      uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_shared INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_id INTEGER NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      question_type TEXT NOT NULL CHECK(question_type IN ('MULTIPLE_CHOICE', 'MULTIPLE_SELECT', 'MATCHING', 'TRUE_FALSE', 'ESSAY')),
      question_text TEXT NOT NULL,
      instructions TEXT DEFAULT '',
      correct_answer_json TEXT NOT NULL DEFAULT '{}',
      partial_credit INTEGER NOT NULL DEFAULT 1,
      default_score REAL NOT NULL DEFAULT 10,
      rubric_text TEXT DEFAULT '',
      difficulty TEXT DEFAULT 'MEDIUM',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS question_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_key TEXT NOT NULL,
      option_text TEXT NOT NULL DEFAULT '',
      is_correct INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS matching_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      pair_key TEXT NOT NULL,
      left_text TEXT NOT NULL DEFAULT '',
      right_key TEXT NOT NULL,
      right_text TEXT NOT NULL DEFAULT '',
      score REAL NOT NULL DEFAULT 5,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS question_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      media_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE RESTRICT,
      placement TEXT NOT NULL CHECK(placement IN ('MAIN_QUESTION', 'INSTRUCTIONS', 'STATEMENT', 'SUPPORTING_MATERIAL')),
      caption TEXT DEFAULT '',
      alt_text TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS option_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_id INTEGER REFERENCES question_options(id) ON DELETE CASCADE,
      matching_pair_id INTEGER REFERENCES matching_pairs(id) ON DELETE CASCADE,
      matching_side TEXT CHECK(matching_side IN ('LEFT', 'RIGHT') OR matching_side IS NULL),
      media_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE RESTRICT,
      caption TEXT DEFAULT '',
      alt_text TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      eligible_class_ids_json TEXT NOT NULL DEFAULT '[]',
      teacher_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      exam_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      exam_code TEXT NOT NULL UNIQUE,
      question_count INTEGER NOT NULL DEFAULT 0,
      randomize_questions INTEGER NOT NULL DEFAULT 0,
      randomize_options INTEGER NOT NULL DEFAULT 0,
      instructions TEXT DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 0,
      allow_audio_replay INTEGER NOT NULL DEFAULT 1,
      max_audio_replays INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS exam_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      score_override REAL,
      UNIQUE(exam_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      student_name TEXT NOT NULL,
      participant_number TEXT NOT NULL,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      class_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY', 'IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED')),
      question_order_json TEXT NOT NULL DEFAULT '[]',
      option_order_json TEXT NOT NULL DEFAULT '{}',
      audio_checked INTEGER NOT NULL DEFAULT 0,
      rules_confirmed INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      expires_at TEXT,
      submitted_at TEXT,
      total_score REAL NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 0,
      auto_graded_score REAL NOT NULL DEFAULT 0,
      essay_score REAL NOT NULL DEFAULT 0,
      violation_count INTEGER NOT NULL DEFAULT 0,
      last_heartbeat_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(exam_id, participant_number)
    );

    CREATE TABLE IF NOT EXISTS student_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      answer_json TEXT NOT NULL DEFAULT 'null',
      is_correct INTEGER,
      score_awarded REAL NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 0,
      audio_play_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS exam_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      violation_type TEXT NOT NULL CHECK(violation_type IN ('TAB_SWITCH', 'EXIT_FULLSCREEN', 'WINDOW_BLUR', 'PAGE_HIDE')),
      details TEXT DEFAULT '',
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS essay_grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      graded_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      score_awarded REAL NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 0,
      feedback TEXT DEFAULT '',
      graded_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT DEFAULT '',
      role TEXT DEFAULT '',
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT DEFAULT '',
      details_json TEXT DEFAULT '{}',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_students_participant ON students(participant_number);
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
    CREATE INDEX IF NOT EXISTS idx_questions_bank ON questions(bank_id);
    CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(question_type);
    CREATE INDEX IF NOT EXISTS idx_question_options_q ON question_options(question_id);
    CREATE INDEX IF NOT EXISTS idx_matching_pairs_q ON matching_pairs(question_id);
    CREATE INDEX IF NOT EXISTS idx_question_media_q ON question_media(question_id);
    CREATE INDEX IF NOT EXISTS idx_option_media_q ON option_media(question_id);
    CREATE INDEX IF NOT EXISTS idx_exams_code ON exams(exam_code);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam ON exam_sessions(exam_id);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_participant ON exam_sessions(participant_number);
    CREATE INDEX IF NOT EXISTS idx_student_answers_session ON student_answers(session_id);
    CREATE INDEX IF NOT EXISTS idx_exam_violations_session ON exam_violations(session_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `);
}
