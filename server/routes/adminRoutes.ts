import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { getDb } from '../database/db.ts';
import {
  hashToken,
  recordAuditLog,
  requireAdmin,
  requireTeacherOrAdmin,
} from '../middleware/auth.ts';

const router = express.Router();

// Reference endpoints accessible by both Admin & Teacher
router.get('/reference/classes', requireTeacherOrAdmin, (_req, res) => {
  const db = getDb();
  const classes = db.prepare(`SELECT * FROM classes ORDER BY grade_level ASC, name ASC`).all();
  res.json({ classes });
});

router.get('/reference/subjects', requireTeacherOrAdmin, (_req, res) => {
  const db = getDb();
  const subjects = db.prepare(`SELECT * FROM subjects ORDER BY name ASC`).all();
  res.json({ subjects });
});

router.get('/reference/teachers', requireTeacherOrAdmin, (_req, res) => {
  const db = getDb();
  const teachers = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.is_active, t.nip, t.phone, t.subject_ids_json, t.class_ids_json
       FROM users u
       LEFT JOIN teachers t ON t.user_id = u.id
       WHERE u.role IN ('TEACHER', 'ADMIN')
       ORDER BY u.full_name ASC`
    )
    .all();
  res.json({ teachers });
});

// Dashboard stats
router.get('/dashboard-stats', requireTeacherOrAdmin, (req, res) => {
  const db = getDb();
  const isAdmin = req.user!.role === 'ADMIN';
  const uid = req.user!.id;

  const totalStudents = (db.prepare(`SELECT COUNT(*) as c FROM students`).get() as { c: number }).c;
  const totalTeachers = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'TEACHER'`).get() as { c: number }).c;
  const totalClasses = (db.prepare(`SELECT COUNT(*) as c FROM classes`).get() as { c: number }).c;
  const totalSubjects = (db.prepare(`SELECT COUNT(*) as c FROM subjects`).get() as { c: number }).c;

  const totalQuestions = isAdmin
    ? (db.prepare(`SELECT COUNT(*) as c FROM questions`).get() as { c: number }).c
    : (db.prepare(`SELECT COUNT(*) as c FROM questions WHERE created_by_user_id = ?`).get(uid) as { c: number }).c;

  const totalExams = isAdmin
    ? (db.prepare(`SELECT COUNT(*) as c FROM exams`).get() as { c: number }).c
    : (db.prepare(`SELECT COUNT(*) as c FROM exams WHERE teacher_user_id = ?`).get(uid) as { c: number }).c;

  const activeSessions = isAdmin
    ? (db.prepare(`SELECT COUNT(*) as c FROM exam_sessions WHERE status = 'IN_PROGRESS'`).get() as { c: number }).c
    : (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM exam_sessions es
             JOIN exams e ON e.id = es.exam_id
             WHERE es.status = 'IN_PROGRESS' AND e.teacher_user_id = ?`
          )
          .get(uid) as { c: number }
      ).c;

  const pendingEssayCount = isAdmin
    ? (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM student_answers sa
             JOIN questions q ON q.id = sa.question_id
             JOIN exam_sessions es ON es.id = sa.session_id
             LEFT JOIN essay_grades eg ON eg.session_id = sa.session_id AND eg.question_id = sa.question_id
             WHERE q.question_type = 'ESSAY' AND es.status IN ('SUBMITTED', 'AUTO_SUBMITTED') AND eg.id IS NULL`
          )
          .get() as { c: number }
      ).c
    : (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM student_answers sa
             JOIN questions q ON q.id = sa.question_id
             JOIN exam_sessions es ON es.id = sa.session_id
             JOIN exams e ON e.id = es.exam_id
             LEFT JOIN essay_grades eg ON eg.session_id = sa.session_id AND eg.question_id = sa.question_id
             WHERE q.question_type = 'ESSAY' AND es.status IN ('SUBMITTED', 'AUTO_SUBMITTED') AND eg.id IS NULL AND e.teacher_user_id = ?`
          )
          .get(uid) as { c: number }
      ).c;

  const recentExams = isAdmin
    ? db
        .prepare(
          `SELECT e.*, s.name as subject_name, u.full_name as teacher_name
           FROM exams e
           JOIN subjects s ON s.id = e.subject_id
           JOIN users u ON u.id = e.teacher_user_id
           ORDER BY e.created_at DESC LIMIT 5`
        )
        .all()
    : db
        .prepare(
          `SELECT e.*, s.name as subject_name, u.full_name as teacher_name
           FROM exams e
           JOIN subjects s ON s.id = e.subject_id
           JOIN users u ON u.id = e.teacher_user_id
           WHERE e.teacher_user_id = ?
           ORDER BY e.created_at DESC LIMIT 5`
        )
        .all(uid);

  res.json({
    stats: {
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSubjects,
      totalQuestions,
      totalExams,
      activeSessions,
      pendingEssayCount,
    },
    recentExams,
  });
});

// ==================== ADMIN-ONLY MANAGEMENT ====================

// Users & Teachers CRUD
router.get('/users', requireAdmin, (_req, res) => {
  const db = getDb();
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.full_name, u.email, u.is_active, u.must_change_password, u.created_at,
              t.nip, t.phone, t.subject_ids_json, t.class_ids_json
       FROM users u
       LEFT JOIN teachers t ON t.user_id = u.id
       ORDER BY u.role ASC, u.full_name ASC`
    )
    .all();
  res.json({ users });
});

router.post('/users', requireAdmin, (req, res) => {
  const { username, password, role, full_name, email, nip, phone, subject_ids, class_ids } = req.body as {
    username?: string;
    password?: string;
    role?: 'ADMIN' | 'TEACHER';
    full_name?: string;
    email?: string;
    nip?: string;
    phone?: string;
    subject_ids?: number[];
    class_ids?: number[];
  };

  if (!username || !password || !role || !full_name) {
    res.status(400).json({ error: 'Username, kata sandi, peran, dan nama lengkap wajib diisi.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Kata sandi minimal 8 karakter.' });
    return;
  }

  const db = getDb();
  const exists = db.prepare(`SELECT id FROM users WHERE LOWER(username) = LOWER(?)`).get(username.trim());
  if (exists) {
    res.status(409).json({ error: 'Username sudah digunakan.' });
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  let userId = 0;

  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, full_name, email, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(username.trim(), hash, role, full_name.trim(), (email || '').trim());
    userId = Number(r.lastInsertRowid);

    if (role === 'TEACHER') {
      db.prepare(
        `INSERT INTO teachers (user_id, nip, phone, subject_ids_json, class_ids_json)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        userId,
        (nip || '').trim(),
        (phone || '').trim(),
        JSON.stringify(subject_ids ?? []),
        JSON.stringify(class_ids ?? [])
      );
    }
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'CREATE_USER',
    resourceType: 'users',
    resourceId: userId,
    details: { createdUsername: username.trim(), createdRole: role },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: userId });
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { full_name, email, is_active, role, nip, phone, subject_ids, class_ids } = req.body as {
    full_name?: string;
    email?: string;
    is_active?: number;
    role?: 'ADMIN' | 'TEACHER';
    nip?: string;
    phone?: string;
    subject_ids?: number[];
    class_ids?: number[];
  };

  const db = getDb();
  const existing = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id) as { id: number; role: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    return;
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE users SET
         full_name = COALESCE(?, full_name),
         email = COALESCE(?, email),
         is_active = COALESCE(?, is_active),
         role = COALESCE(?, role),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(full_name?.trim() ?? null, email?.trim() ?? null, is_active ?? null, role ?? null, id);

    const targetRole = role ?? existing.role;
    if (targetRole === 'TEACHER') {
      const hasTeacher = db.prepare(`SELECT id FROM teachers WHERE user_id = ?`).get(id);
      if (hasTeacher) {
        db.prepare(
          `UPDATE teachers SET
             nip = COALESCE(?, nip),
             phone = COALESCE(?, phone),
             subject_ids_json = COALESCE(?, subject_ids_json),
             class_ids_json = COALESCE(?, class_ids_json)
           WHERE user_id = ?`
        ).run(
          nip ?? null,
          phone ?? null,
          subject_ids ? JSON.stringify(subject_ids) : null,
          class_ids ? JSON.stringify(class_ids) : null,
          id
        );
      } else {
        db.prepare(
          `INSERT INTO teachers (user_id, nip, phone, subject_ids_json, class_ids_json) VALUES (?, ?, ?, ?, ?)`
        ).run(id, nip || '', phone || '', JSON.stringify(subject_ids ?? []), JSON.stringify(class_ids ?? []));
      }
    }
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'UPDATE_USER',
    resourceType: 'users',
    resourceId: id,
    ipAddress: req.ip,
  });

  res.json({ success: true });
});

router.post('/users/:id/reset-password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body as { newPassword?: string };
  const db = getDb();
  const user = db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(id) as
    | { id: number; username: string }
    | undefined;
  if (!user) {
    res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    return;
  }

  if (newPassword) {
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Kata sandi baru minimal 8 karakter.' });
      return;
    }
    const hash = bcrypt.hashSync(newPassword, 12);
    db.prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?`
    ).run(hash, id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id);

    recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      role: req.user!.role,
      action: 'ADMIN_RESET_USER_PASSWORD',
      resourceType: 'users',
      resourceId: id,
      ipAddress: req.ip,
    });
    res.json({ success: true, message: 'Kata sandi pengguna berhasil diatur ulang.' });
    return;
  }

  // Generate one-time reset token for user
  const rawToken = crypto.randomBytes(4).toString('hex').toUpperCase();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_by_user_id) VALUES (?, ?, ?, ?)`
  ).run(id, tokenHash, expiresAt, req.user!.id);

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'GENERATE_PASSWORD_RESET_TOKEN',
    resourceType: 'users',
    resourceId: id,
    ipAddress: req.ip,
  });

  res.json({ success: true, resetToken: rawToken, expiresAt });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'Tidak dapat menghapus akun Anda sendiri.' });
    return;
  }
  const db = getDb();
  try {
    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    recordAuditLog({
      userId: req.user!.id,
      username: req.user!.username,
      role: req.user!.role,
      action: 'DELETE_USER',
      resourceType: 'users',
      resourceId: id,
      ipAddress: req.ip,
    });
    res.json({ success: true });
  } catch {
    res.status(409).json({
      error: 'Pengguna tidak dapat dihapus karena masih terkait dengan soal atau ujian. Nonaktifkan akun sebagai gantinya.',
    });
  }
});

// Students CRUD
router.get('/students', requireAdmin, (req, res) => {
  const db = getDb();
  const classId = req.query.classId ? Number(req.query.classId) : null;
  const search = req.query.search ? `%${String(req.query.search).trim()}%` : null;

  let sql = `SELECT s.*, c.name as class_name
             FROM students s
             JOIN classes c ON c.id = s.class_id
             WHERE 1=1`;
  const params: unknown[] = [];

  if (classId) {
    sql += ` AND s.class_id = ?`;
    params.push(classId);
  }
  if (search) {
    sql += ` AND (s.full_name LIKE ? OR s.participant_number LIKE ?)`;
    params.push(search, search);
  }
  sql += ` ORDER BY c.name ASC, s.full_name ASC`;

  const students = db.prepare(sql).all(...params);
  res.json({ students });
});

router.post('/students', requireAdmin, (req, res) => {
  const { participant_number, full_name, class_id, gender } = req.body as {
    participant_number?: string;
    full_name?: string;
    class_id?: number;
    gender?: string;
  };
  if (!participant_number || !full_name || !class_id) {
    res.status(400).json({ error: 'Nomor peserta, nama lengkap, dan kelas wajib diisi.' });
    return;
  }

  const db = getDb();
  const dup = db.prepare(`SELECT id FROM students WHERE participant_number = ?`).get(participant_number.trim());
  if (dup) {
    res.status(409).json({ error: 'Nomor peserta sudah terdaftar.' });
    return;
  }

  const r = db
    .prepare(
      `INSERT INTO students (participant_number, full_name, class_id, gender, is_active)
       VALUES (?, ?, ?, ?, 1)`
    )
    .run(participant_number.trim(), full_name.trim(), Number(class_id), gender || 'L');

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'CREATE_STUDENT',
    resourceType: 'students',
    resourceId: Number(r.lastInsertRowid),
    ipAddress: req.ip,
  });

  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.put('/students/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { participant_number, full_name, class_id, gender, is_active } = req.body as {
    participant_number?: string;
    full_name?: string;
    class_id?: number;
    gender?: string;
    is_active?: number;
  };
  const db = getDb();
  db.prepare(
    `UPDATE students SET
       participant_number = COALESCE(?, participant_number),
       full_name = COALESCE(?, full_name),
       class_id = COALESCE(?, class_id),
       gender = COALESCE(?, gender),
       is_active = COALESCE(?, is_active),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    participant_number?.trim() ?? null,
    full_name?.trim() ?? null,
    class_id ?? null,
    gender ?? null,
    is_active ?? null,
    id
  );
  res.json({ success: true });
});

router.delete('/students/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM students WHERE id = ?`).run(Number(req.params.id));
  res.json({ success: true });
});

// Classes CRUD
router.get('/classes', requireAdmin, (_req, res) => {
  const db = getDb();
  const classes = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) as student_count
       FROM classes c ORDER BY c.grade_level ASC, c.name ASC`
    )
    .all();
  res.json({ classes });
});

router.post('/classes', requireAdmin, (req, res) => {
  const { name, grade_level, academic_year } = req.body as {
    name?: string;
    grade_level?: number;
    academic_year?: string;
  };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Nama kelas wajib diisi.' });
    return;
  }
  const db = getDb();
  try {
    const r = db
      .prepare(`INSERT INTO classes (name, grade_level, academic_year) VALUES (?, ?, ?)`)
      .run(name.trim(), Number(grade_level || 7), (academic_year || '2026/2027').trim());
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'Nama kelas sudah ada.' });
  }
});

router.put('/classes/:id', requireAdmin, (req, res) => {
  const { name, grade_level, academic_year } = req.body as {
    name?: string;
    grade_level?: number;
    academic_year?: string;
  };
  const db = getDb();
  db.prepare(
    `UPDATE classes SET
       name = COALESCE(?, name),
       grade_level = COALESCE(?, grade_level),
       academic_year = COALESCE(?, academic_year)
     WHERE id = ?`
  ).run(name?.trim() ?? null, grade_level ?? null, academic_year?.trim() ?? null, Number(req.params.id));
  res.json({ success: true });
});

router.delete('/classes/:id', requireAdmin, (req, res) => {
  const db = getDb();
  try {
    db.prepare(`DELETE FROM classes WHERE id = ?`).run(Number(req.params.id));
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'Kelas tidak dapat dihapus karena masih digunakan oleh siswa atau sesi ujian.' });
  }
});

// Subjects CRUD
router.get('/subjects', requireAdmin, (_req, res) => {
  const db = getDb();
  const subjects = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id) as question_count
       FROM subjects s ORDER BY s.name ASC`
    )
    .all();
  res.json({ subjects });
});

router.post('/subjects', requireAdmin, (req, res) => {
  const { code, name, description } = req.body as { code?: string; name?: string; description?: string };
  if (!code || !name) {
    res.status(400).json({ error: 'Kode dan nama mata pelajaran wajib diisi.' });
    return;
  }
  const db = getDb();
  try {
    const r = db
      .prepare(`INSERT INTO subjects (code, name, description) VALUES (?, ?, ?)`)
      .run(code.trim().toUpperCase(), name.trim(), (description || '').trim());
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'Kode mata pelajaran sudah terdaftar.' });
  }
});

router.put('/subjects/:id', requireAdmin, (req, res) => {
  const { code, name, description } = req.body as { code?: string; name?: string; description?: string };
  const db = getDb();
  db.prepare(
    `UPDATE subjects SET
       code = COALESCE(?, code),
       name = COALESCE(?, name),
       description = COALESCE(?, description)
     WHERE id = ?`
  ).run(code?.trim().toUpperCase() ?? null, name?.trim() ?? null, description?.trim() ?? null, Number(req.params.id));
  res.json({ success: true });
});

router.delete('/subjects/:id', requireAdmin, (req, res) => {
  const db = getDb();
  try {
    db.prepare(`DELETE FROM subjects WHERE id = ?`).run(Number(req.params.id));
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'Mata pelajaran tidak dapat dihapus karena masih digunakan pada soal atau ujian.' });
  }
});

// Settings & Audit Logs
router.get('/settings', requireAdmin, (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value, updated_at FROM system_settings`).all() as Array<{
    key: string;
    value: string;
    updated_at: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of rows) {
    settings[r.key] = r.value;
  }
  res.json({ settings });
});

router.put('/settings', requireAdmin, (req, res) => {
  const updates = req.body as Record<string, string>;
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      upsert.run(k, String(v));
    }
  })();

  recordAuditLog({
    userId: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    action: 'UPDATE_SYSTEM_SETTINGS',
    resourceType: 'system_settings',
    details: updates,
    ipAddress: req.ip,
  });

  res.json({ success: true });
});

router.get('/audit-logs', requireAdmin, (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const logs = db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?`).all(limit);
  res.json({ logs });
});

export default router;
