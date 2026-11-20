import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDb } from './db.ts';
import { runMigrations } from './schema.ts';

export function ensureStorageDirs(): void {
  const dirs = [
    path.resolve(process.cwd(), 'server', 'storage', 'images'),
    path.resolve(process.cwd(), 'server', 'storage', 'audio'),
    path.resolve(process.cwd(), 'server', 'storage', 'temp'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function seedReferenceData(targetDb?: Database.Database): void {
  const db = targetDb ?? getDb();
  runMigrations(db);
  ensureStorageDirs();

  // Seed default system settings
  const defaultSettings: Array<[string, string]> = [
    ['institution_name', 'SMP KARTINI 1 BATAM'],
    ['foundation_name', 'YAYASAN KELUARGA BATAM'],
    ['app_title', 'KARTINI CBT 4.0'],
    ['academic_year', '2026/2027'],
    ['max_image_size_mb', '10'],
    ['max_audio_size_mb', '25'],
    ['anti_cheat_strict_mode', 'true'],
    ['allow_public_schedule', 'true'],
  ];
  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)`
  );
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }

  // Seed default classes if empty
  const classCount = (db.prepare(`SELECT COUNT(*) as cnt FROM classes`).get() as { cnt: number }).cnt;
  if (classCount === 0) {
    const insertClass = db.prepare(
      `INSERT INTO classes (name, grade_level, academic_year) VALUES (?, ?, ?)`
    );
    const defaultClasses: Array<[string, number, string]> = [
      ['VII-A', 7, '2026/2027'],
      ['VII-B', 7, '2026/2027'],
      ['VIII-A', 8, '2026/2027'],
      ['VIII-B', 8, '2026/2027'],
      ['IX-A', 9, '2026/2027'],
      ['IX-B', 9, '2026/2027'],
    ];
    for (const [name, grade, year] of defaultClasses) {
      insertClass.run(name, grade, year);
    }
  }

  // Seed default subjects if empty
  const subjectCount = (db.prepare(`SELECT COUNT(*) as cnt FROM subjects`).get() as { cnt: number }).cnt;
  if (subjectCount === 0) {
    const insertSubject = db.prepare(
      `INSERT INTO subjects (code, name, description) VALUES (?, ?, ?)`
    );
    const defaultSubjects: Array<[string, string, string]> = [
      ['BIND', 'Bahasa Indonesia', 'Literasi dan Tata Bahasa Indonesia'],
      ['BING', 'Bahasa Inggris', 'English Reading, Listening & Grammar'],
      ['MAT', 'Matematika', 'Aljabar, Geometri, dan Statistika'],
      ['IPA', 'Ilmu Pengetahuan Alam', 'Fisika, Biologi, dan Kimia Terpadu'],
      ['IPS', 'Ilmu Pengetahuan Sosial', 'Sejarah, Geografi, dan Ekonomi'],
      ['PKN', 'Pendidikan Pancasila', 'Kewarganegaraan dan Konstitusi'],
    ];
    for (const [code, name, desc] of defaultSubjects) {
      insertSubject.run(code, name, desc);
    }
  }

  // Seed sample students if empty (students do not have login accounts)
  const studentCount = (db.prepare(`SELECT COUNT(*) as cnt FROM students`).get() as { cnt: number }).cnt;
  if (studentCount === 0) {
    const firstClass = db.prepare(`SELECT id FROM classes ORDER BY id ASC LIMIT 1`).get() as { id: number } | undefined;
    const secondClass = db.prepare(`SELECT id FROM classes ORDER BY id ASC LIMIT 1 OFFSET 2`).get() as { id: number } | undefined;
    if (firstClass) {
      const insertStudent = db.prepare(
        `INSERT INTO students (participant_number, full_name, class_id, gender) VALUES (?, ?, ?, ?)`
      );
      insertStudent.run('KRT-2026-001', 'Aisyah Putri Rahma', firstClass.id, 'P');
      insertStudent.run('KRT-2026-002', 'Bima Pratama Putra', firstClass.id, 'L');
      insertStudent.run('KRT-2026-003', 'Citra Dewi Lestari', (secondClass ?? firstClass).id, 'P');
      insertStudent.run('KRT-2026-004', 'Dimas Aditya Saputra', (secondClass ?? firstClass).id, 'L');
    }
  }

  // Optional automated/CLI admin setup ONLY when ADMIN_INIT_PASSWORD env var is explicitly supplied
  const adminInitUsername = process.env.ADMIN_INIT_USERNAME?.trim();
  const adminInitPassword = process.env.ADMIN_INIT_PASSWORD?.trim();
  if (adminInitUsername && adminInitPassword) {
    const existingAdmin = db.prepare(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`).get();
    if (!existingAdmin) {
      const hash = bcrypt.hashSync(adminInitPassword, 12);
      db.prepare(
        `INSERT INTO users (username, password_hash, role, full_name, email) VALUES (?, ?, 'ADMIN', ?, ?)`
      ).run(adminInitUsername, hash, 'Administrator Utama', '');
    }
  }
}

export function seedSampleQuestionBankForUser(userId: number, targetDb?: Database.Database): void {
  const db = targetDb ?? getDb();
  const existingBank = db.prepare(`SELECT id FROM question_banks LIMIT 1`).get();
  if (existingBank) return;

  const subject = db.prepare(`SELECT id FROM subjects WHERE code = 'BING' LIMIT 1`).get() as { id: number } | undefined
    ?? (db.prepare(`SELECT id FROM subjects LIMIT 1`).get() as { id: number } | undefined);
  const cls = db.prepare(`SELECT id FROM classes LIMIT 1`).get() as { id: number } | undefined;
  if (!subject) return;

  const bankRes = db.prepare(
    `INSERT INTO question_banks (title, description, subject_id, class_id, owner_user_id, is_shared)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(
    'Bank Soal Bahasa Inggris — Paket Contoh CBT 4.0',
    'Kumpulan soal contoh untuk kelima tipe soal (Pilihan Ganda, Pilihan Ganda Kompleks, Menjodohkan, Benar/Salah, dan Esai).',
    subject.id,
    cls?.id ?? null,
    userId
  );
  const bankId = Number(bankRes.lastInsertRowid);

  // 1. Multiple Choice
  const q1 = db.prepare(
    `INSERT INTO questions (bank_id, subject_id, class_id, created_by_user_id, question_type, question_text, instructions, correct_answer_json, default_score)
     VALUES (?, ?, ?, ?, 'MULTIPLE_CHOICE', ?, ?, ?, 10)`
  ).run(
    bankId, subject.id, cls?.id ?? null, userId,
    'What is the past form (Verb 2) of the word "GO"?',
    'Pilih satu jawaban yang paling tepat.',
    JSON.stringify({ correctKey: 'B' })
  );
  const q1Id = Number(q1.lastInsertRowid);
  const insOpt = db.prepare(`INSERT INTO question_options (question_id, option_key, option_text, is_correct, sort_order) VALUES (?, ?, ?, ?, ?)`);
  insOpt.run(q1Id, 'A', 'Goes', 0, 1);
  insOpt.run(q1Id, 'B', 'Went', 1, 2);
  insOpt.run(q1Id, 'C', 'Gone', 0, 3);
  insOpt.run(q1Id, 'D', 'Going', 0, 4);

  // 2. Multiple Select
  const q2 = db.prepare(
    `INSERT INTO questions (bank_id, subject_id, class_id, created_by_user_id, question_type, question_text, instructions, correct_answer_json, partial_credit, default_score)
     VALUES (?, ?, ?, ?, 'MULTIPLE_SELECT', ?, ?, ?, 1, 10)`
  ).run(
    bankId, subject.id, cls?.id ?? null, userId,
    'Which of the following are categorized as fruits?',
    'Pilih lebih dari satu jawaban yang benar.',
    JSON.stringify({ correctKeys: ['A', 'C'] })
  );
  const q2Id = Number(q2.lastInsertRowid);
  insOpt.run(q2Id, 'A', 'Apple', 1, 1);
  insOpt.run(q2Id, 'B', 'Carrot', 0, 2);
  insOpt.run(q2Id, 'C', 'Banana', 1, 3);
  insOpt.run(q2Id, 'D', 'Potato', 0, 4);

  // 3. True/False
  const q3 = db.prepare(
    `INSERT INTO questions (bank_id, subject_id, class_id, created_by_user_id, question_type, question_text, instructions, correct_answer_json, default_score)
     VALUES (?, ?, ?, ?, 'TRUE_FALSE', ?, ?, ?, 10)`
  ).run(
    bankId, subject.id, cls?.id ?? null, userId,
    'The past tense form of "GO" is "WENT".',
    'Tentukan apakah pernyataan berikut BENAR (TRUE) atau SALAH (FALSE).',
    JSON.stringify({ correctValue: 'TRUE' })
  );
  const q3Id = Number(q3.lastInsertRowid);
  insOpt.run(q3Id, 'TRUE', 'BENAR (TRUE)', 1, 1);
  insOpt.run(q3Id, 'FALSE', 'SALAH (FALSE)', 0, 2);

  // 4. Matching
  const q4 = db.prepare(
    `INSERT INTO questions (bank_id, subject_id, class_id, created_by_user_id, question_type, question_text, instructions, correct_answer_json, default_score)
     VALUES (?, ?, ?, ?, 'MATCHING', ?, ?, ?, 30)`
  ).run(
    bankId, subject.id, cls?.id ?? null, userId,
    'Match each item in Column A with the correct pair in Column B.',
    'Pasangkan setiap pernyataan di Kolom A dengan jawaban yang sesuai di Kolom B.',
    JSON.stringify({ pairs: { '1': 'B', '2': 'C', '3': 'A' } })
  );
  const q4Id = Number(q4.lastInsertRowid);
  const insPair = db.prepare(
    `INSERT INTO matching_pairs (question_id, pair_key, left_text, right_key, right_text, score, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insPair.run(q4Id, '1', 'Capital of Indonesia', 'B', 'Jakarta', 10, 1);
  insPair.run(q4Id, '2', 'Past form of GO', 'C', 'Went', 10, 2);
  insPair.run(q4Id, '3', 'Opposite of BIG', 'A', 'Small', 10, 3);

  // 5. Essay
  db.prepare(
    `INSERT INTO questions (bank_id, subject_id, class_id, created_by_user_id, question_type, question_text, instructions, correct_answer_json, default_score, rubric_text)
     VALUES (?, ?, ?, ?, 'ESSAY', ?, ?, ?, 20, ?)`
  ).run(
    bankId, subject.id, cls?.id ?? null, userId,
    'Explain why learning English is important for junior high school students in Batam.',
    'Tuliskan jawaban uraian Anda dengan jelas dan terstruktur.',
    JSON.stringify({ manualGrading: true }),
    'Skor penuh (20): Menjelaskan minimal 2 alasan relevan (komunikasi global, pendidikan/karir, teknologi) dengan struktur kalimat yang baik.'
  );
}
