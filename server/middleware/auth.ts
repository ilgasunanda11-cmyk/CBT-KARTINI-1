import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../database/db.ts';

export interface AuthUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'TEACHER';
  full_name: string;
  email: string | null;
  is_active: number;
  must_change_password: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionTokenHash?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'kbt_session';

export function hashToken(rawToken: string): string {
  const secret = process.env.SESSION_SECRET || 'kartini-cbt-dev-session-salt';
  return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
}

export function createUserSession(userId: number, req: Request): string {
  const db = getDb();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, tokenHash, expiresAt, req.ip || '', req.get('user-agent') || '');

  return rawToken;
}

export function attachAuthUser(req: Request, _res: Response, next: NextFunction): void {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!rawToken) {
    next();
    return;
  }

  try {
    const db = getDb();
    const tokenHash = hashToken(rawToken);
    const row = db
      .prepare(
        `SELECT u.id, u.username, u.role, u.full_name, u.email, u.is_active, u.must_change_password, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(tokenHash) as (AuthUser & { expires_at: string }) | undefined;

    if (row && row.is_active === 1 && new Date(row.expires_at).getTime() > Date.now()) {
      req.user = {
        id: row.id,
        username: row.username,
        role: row.role,
        full_name: row.full_name,
        email: row.email,
        is_active: row.is_active,
        must_change_password: row.must_change_password,
      };
      req.sessionTokenHash = tokenHash;
    }
  } catch {
    // Ignore invalid session lookup and proceed unauthenticated
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Autentikasi diperlukan.' });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Akses ditolak. Diperlukan hak akses Administrator.' });
    return;
  }
  next();
}

export function requireTeacherOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Autentikasi diperlukan.' });
    return;
  }
  if (req.user.role !== 'ADMIN' && req.user.role !== 'TEACHER') {
    res.status(403).json({ error: 'Akses ditolak.' });
    return;
  }
  next();
}

export function recordAuditLog(params: {
  userId?: number | null;
  username?: string;
  role?: string;
  action: string;
  resourceType: string;
  resourceId?: string | number;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (user_id, username, role, action, resource_type, resource_id, details_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId ?? null,
      params.username ?? '',
      params.role ?? '',
      params.action,
      params.resourceType,
      String(params.resourceId ?? ''),
      JSON.stringify(params.details ?? {}),
      params.ipAddress ?? ''
    );
  } catch {
    // Never crash business operation due to audit log write failure
  }
}
