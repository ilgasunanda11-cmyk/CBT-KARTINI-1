import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { getDb } from '../database/db.ts';
import { SESSION_COOKIE_NAME, hashToken } from '../middleware/auth.ts';

interface ObserverClient {
  ws: WebSocket;
  userId: number;
  role: 'ADMIN' | 'TEACHER';
  examIdFilter?: number;
}

interface StudentClient {
  ws: WebSocket;
  sessionId: number;
  examId: number;
}

const observers = new Set<ObserverClient>();
const students = new Map<number, StudentClient>();

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

export function broadcastMonitoringEvent(examId: number, event: string, payload: Record<string, unknown>): void {
  const message = JSON.stringify({
    event,
    examId,
    payload,
    timestamp: new Date().toISOString(),
  });

  for (const obs of observers) {
    if (obs.ws.readyState !== WebSocket.OPEN) continue;
    if (obs.examIdFilter && obs.examIdFilter !== examId) continue;

    // Teachers only receive events for their authorized exams
    if (obs.role === 'TEACHER') {
      try {
        const db = getDb();
        const exam = db.prepare(`SELECT teacher_user_id FROM exams WHERE id = ?`).get(examId) as
          | { teacher_user_id: number }
          | undefined;
        if (!exam || exam.teacher_user_id !== obs.userId) continue;
      } catch {
        continue;
      }
    }
    obs.ws.send(message);
  }
}

export function attachWebSocketServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost');
    const clientType = url.searchParams.get('type') || 'observer';

    if (clientType === 'student') {
      const sessionId = Number(url.searchParams.get('sessionId'));
      const examId = Number(url.searchParams.get('examId'));
      if (!sessionId || !examId) {
        ws.close(1008, 'Invalid session parameters');
        return;
      }

      const client: StudentClient = { ws, sessionId, examId };
      students.set(sessionId, client);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type: string; remainingSeconds?: number };
          if (msg.type === 'heartbeat') {
            const db = getDb();
            db.prepare(`UPDATE exam_sessions SET last_heartbeat_at = datetime('now') WHERE id = ?`).run(sessionId);
            broadcastMonitoringEvent(examId, 'session:heartbeat', {
              sessionId,
              remainingSeconds: msg.remainingSeconds,
            });
          }
        } catch {
          // Ignore malformed ws messages
        }
      });

      ws.on('close', () => {
        students.delete(sessionId);
      });
      return;
    }

    // Observer (Admin / Teacher) authentication via session cookie
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[SESSION_COOKIE_NAME];
    if (!rawToken) {
      ws.close(1008, 'Authentication required');
      return;
    }

    try {
      const db = getDb();
      const tokenHash = hashToken(rawToken);
      const user = db
        .prepare(
          `SELECT u.id, u.role, u.is_active, s.expires_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ?`
        )
        .get(tokenHash) as { id: number; role: 'ADMIN' | 'TEACHER'; is_active: number; expires_at: string } | undefined;

      if (!user || user.is_active !== 1 || new Date(user.expires_at).getTime() <= Date.now()) {
        ws.close(1008, 'Invalid or expired session');
        return;
      }

      const examIdParam = url.searchParams.get('examId');
      const observer: ObserverClient = {
        ws,
        userId: user.id,
        role: user.role,
        examIdFilter: examIdParam ? Number(examIdParam) : undefined,
      };
      observers.add(observer);

      ws.send(
        JSON.stringify({
          event: 'ws:connected',
          payload: { role: user.role, userId: user.id },
          timestamp: new Date().toISOString(),
        })
      );

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type: string; examId?: number };
          if (msg.type === 'subscribe') {
            observer.examIdFilter = msg.examId ? Number(msg.examId) : undefined;
          }
        } catch {
          // ignore
        }
      });

      ws.on('close', () => {
        observers.delete(observer);
      });
    } catch {
      ws.close(1011, 'Server error');
    }
  });

  return wss;
}
