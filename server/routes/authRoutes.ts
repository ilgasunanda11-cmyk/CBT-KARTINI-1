import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { getDb } from '../database/db.ts';
import { seedSampleQuestionBankForUser } from '../database/seed.ts';
import {
  SESSION_COOKIE_NAME,
  createUserSession,
  hashToken,
  recordAuditLog,
  requireAuth,
} from '../middleware/auth.ts';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.' },
});

function setSessionCookie(res: express.Response, rawToken: string): void {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Kata sandi minimal harus 8 karakter.';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Kata sandi harus mengandung kombinasi huruf dan angka.';
  }
  return null;
}

router.get('/setup-status', (_req, res) => {
  const db = getDb();
  const admin = db.prepare(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`).get();
  res.json({ needsInitialSetup: !admin });
});

router.post('/admin/setup', (req, res) => {
  const db = getDb();
  const existingAdmin = db.prepare(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`).get();
  if (existingAdmin) {
    res.status(403).json({ error: 'Administrator awal sudah dikonfigurasi.' });
    return;
  }

  const { username, password, full_name, email } = req.body as {
    username?: string;
    password?: string;
    full_name?: string;
    email?: string;
  };

  if (!username || !username.trim() || !full_name || !full_name.trim()) {
    res.status(400).json({ error: 'Username dan nama lengkap wajib diisi.' });
    return;
  }

  const pwErr = validatePasswordStrength(password || '');
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }

  const cleanUsername = username.trim();
  const hash = bcrypt.hashSync(password!, 12);
  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, role, full_name, email, is_active)
       VALUES (?, ?, 'ADMIN', ?, ?, 1)`
    )
    .run(cleanUsername, hash, full_name.trim(), (email || '').trim());

  const userId = Number(result.lastInsertRowid);
  seedSampleQuestionBankForUser(userId, db);

  const rawToken = createUserSession(userId, req);
  setSessionCookie(res, rawToken);

  recordAuditLog({
    userId,
    username: cleanUsername,
    role: 'ADMIN',
    action: 'INITIAL_ADMIN_SETUP',
    resourceType: 'users',
    resourceId: userId,
    ipAddress: req.ip,
  });

  res.status(201).json({
    user: {
      id: userId,
      username: cleanUsername,
      role: 'ADMIN',
      full_name: full_name.trim(),
      email: (email || '').trim(),
      must_change_password: 0,
    },
  });
});

function handleRoleLogin(expectedRole: 'ADMIN' | 'TEACHER') {
  return (req: express.Request, res: express.Response) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, username, password_hash, role, full_name, email, is_active, must_change_password
         FROM users WHERE LOWER(username) = LOWER(?)`
      )
      .get(username.trim()) as
      | {
          id: number;
          username: string;
          password_hash: string;
          role: 'ADMIN' | 'TEACHER';
          full_name: string;
          email: string | null;
          is_active: number;
          must_change_password: number;
        }
      | undefined;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      recordAuditLog({
        username: username.trim(),
        role: expectedRole,
        action: 'LOGIN_FAILED',
        resourceType: 'auth',
        details: { reason: 'invalid_credentials' },
        ipAddress: req.ip,
      });
      res.status(401).json({ error: 'Username atau kata sandi salah.' });
      return;
    }

    if (user.is_active !== 1) {
      res.status(403).json({ error: 'Akun dinonaktifkan. Hubungi Administrator.' });
      return;
    }

    if (user.role !== expectedRole) {
      res.status(403).json({
        error:
          expectedRole === 'ADMIN'
            ? 'Akun ini bukan akun Administrator. Gunakan halaman Login Guru.'
            : 'Akun ini bukan akun Guru. Gunakan halaman Login Admin.',
      });
      return;
    }

    const rawToken = createUserSession(user.id, req);
    setSessionCookie(res, rawToken);

    recordAuditLog({
      userId: user.id,
      username: user.username,
      role: user.role,
      action: 'LOGIN_SUCCESS',
      resourceType: 'auth',
      ipAddress: req.ip,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        email: user.email,
        must_change_password: user.must_change_password,
      },
    });
  };
}

router.post('/admin/login', authLimiter, handleRoleLogin('ADMIN'));
router.post('/teacher/login', authLimiter, handleRoleLogin('TEACHER'));

router.get('/me', (req, res) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }
  res.json({ user: req.user });
});

router.post('/logout', (req, res) => {
  if (req.sessionTokenHash) {
    const db = getDb();
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(req.sessionTokenHash);
    recordAuditLog({
      userId: req.user?.id,
      username: req.user?.username,
      role: req.user?.role,
      action: 'LOGOUT',
      resourceType: 'auth',
      ipAddress: req.ip,
    });
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

router.post('/change-password', (req, res) => {
  const { username, currentPassword, newPassword, confirmPassword } = req.body as {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  if (!currentPassword || !newPassword || !confirmPassword) {
    res.status(400).json({ error: 'Semua kolom kata sandi wajib diisi.' });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'Konfirmasi kata sandi baru tidak cocok.' });
    return;
  }

  const pwErr = validatePasswordStrength(newPassword);
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }

  const db = getDb();
  let userRow:
    | { id: number; username: string; password_hash: string; role: string }
    | undefined;

  if (req.user) {
    userRow = db
      .prepare(`SELECT id, username, password_hash, role FROM users WHERE id = ?`)
      .get(req.user.id) as { id: number; username: string; password_hash: string; role: string } | undefined;
  } else if (username) {
    userRow = db
      .prepare(`SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER(?)`)
      .get(username.trim()) as { id: number; username: string; password_hash: string; role: string } | undefined;
  } else {
    res.status(400).json({ error: 'Username wajib diisi jika belum login.' });
    return;
  }

  if (!userRow || !bcrypt.compareSync(currentPassword, userRow.password_hash)) {
    res.status(401).json({ error: 'Kata sandi saat ini tidak sesuai.' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`
  ).run(newHash, userRow.id);

  recordAuditLog({
    userId: userRow.id,
    username: userRow.username,
    role: userRow.role,
    action: 'CHANGE_PASSWORD',
    resourceType: 'users',
    resourceId: userRow.id,
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Kata sandi berhasil diperbarui.' });
});

router.post('/forgot-password', authLimiter, (req, res) => {
  const { username, role } = req.body as { username?: string; role?: 'ADMIN' | 'TEACHER' };
  if (!username || !username.trim()) {
    res.status(400).json({ error: 'Username wajib diisi.' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare(`SELECT id, username, role, full_name FROM users WHERE LOWER(username) = LOWER(?)`)
    .get(username.trim()) as { id: number; username: string; role: string; full_name: string } | undefined;

  if (!user || (role && user.role !== role)) {
    // Return uniform response without leaking user existence unless admin reset needed
    res.json({
      success: true,
      message:
        'Jika akun terdaftar, permintaan reset kata sandi telah dicatat. Silakan hubungi Administrator SMP Kartini 1 Batam untuk mendapatkan token reset resmi.',
    });
    return;
  }

  const rawResetCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const tokenHash = hashToken(rawResetCode);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  ).run(user.id, tokenHash, expiresAt);

  recordAuditLog({
    userId: user.id,
    username: user.username,
    role: user.role,
    action: 'FORGOT_PASSWORD_REQUEST',
    resourceType: 'password_reset_tokens',
    details: { expiresAt },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message:
      'Permintaan reset kata sandi telah dicatat pada sistem. Administrator dapat menerbitkan atau memverifikasi kode reset pada menu Manajemen Guru / Audit Log.',
  });
});

router.post('/reset-password', authLimiter, (req, res) => {
  const { username, resetToken, newPassword, confirmPassword } = req.body as {
    username?: string;
    resetToken?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  if (!username || !resetToken || !newPassword || !confirmPassword) {
    res.status(400).json({ error: 'Username, token reset, dan kata sandi baru wajib diisi.' });
    return;
  }
  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'Konfirmasi kata sandi baru tidak cocok.' });
    return;
  }

  const pwErr = validatePasswordStrength(newPassword);
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }

  const db = getDb();
  const tokenHash = hashToken(resetToken.trim().toUpperCase());
  const row = db
    .prepare(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.username, u.role
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ? AND LOWER(u.username) = LOWER(?)`
    )
    .get(tokenHash, username.trim()) as
    | { id: number; user_id: number; expires_at: string; used_at: string | null; username: string; role: string }
    | undefined;

  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    res.status(400).json({ error: 'Token reset tidak valid atau sudah kedaluwarsa.' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`).run(
      newHash,
      row.user_id
    );
    db.prepare(`UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?`).run(row.id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(row.user_id);
  })();

  recordAuditLog({
    userId: row.user_id,
    username: row.username,
    role: row.role,
    action: 'PASSWORD_RESET_COMPLETED',
    resourceType: 'users',
    resourceId: row.user_id,
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Kata sandi berhasil direset. Silakan login dengan kata sandi baru.' });
});

router.get('/profile', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
