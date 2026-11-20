import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type { Exam, MonitoringSession } from '../../types';

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function ExamMonitoringPage() {
  const { showToast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState('');
  const [sessions, setSessions] = useState<MonitoringSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<Array<{ id: string; text: string; time: string }>>([]);

  const loadSnapshot = useCallback(async () => {
    try {
      const q = examId ? `?examId=${examId}` : '';
      const [mRes, eRes] = await Promise.all([
        apiRequest<{ sessions: MonitoringSession[] }>(`/api/monitoring${q}`),
        apiRequest<{ exams: Exam[] }>('/api/exams'),
      ]);
      setSessions(mRes.sessions);
      setExams(eRes.exams);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [examId, showToast]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  // Real-time WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const q = examId ? `&examId=${examId}` : '';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws?type=observer${q}`);

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as {
          event: string;
          examId?: number;
          payload: Record<string, unknown>;
          timestamp: string;
        };

        if (msg.event === 'session:started' || msg.event === 'session:submitted') {
          void loadSnapshot();
        } else if (msg.event === 'session:progress') {
          const sid = Number(msg.payload.sessionId);
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sid
                ? {
                    ...s,
                    answered_count: Number(msg.payload.answeredCount ?? s.answered_count),
                    unanswered_count: Number(msg.payload.unansweredCount ?? s.unanswered_count),
                    remaining_seconds: Number(msg.payload.remainingSeconds ?? s.remaining_seconds),
                  }
                : s
            )
          );
        } else if (msg.event === 'session:violation') {
          const sid = Number(msg.payload.sessionId);
          const studentName = String(msg.payload.studentName || 'Siswa');
          const vType = String(msg.payload.violationType || 'VIOLATION');
          const vCount = Number(msg.payload.violationCount || 1);

          setSessions((prev) =>
            prev.map((s) => (s.id === sid ? { ...s, violation_count: vCount } : s))
          );
          setLiveAlerts((prev) => [
            {
              id: `${sid}_${Date.now()}`,
              text: `${studentName} terdeteksi ${vType} (Total pelanggaran: ${vCount})`,
              time: new Date().toLocaleTimeString('id-ID'),
            },
            ...prev.slice(0, 9),
          ]);
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      ws.close();
    };
  }, [examId, loadSnapshot]);

  // Tick remaining seconds smoothly for active sessions
  useEffect(() => {
    const timer = setInterval(() => {
      setSessions((prev) =>
        prev.map((s) =>
          s.status === 'IN_PROGRESS' && s.remaining_seconds > 0
            ? { ...s, remaining_seconds: s.remaining_seconds - 1 }
            : s
        )
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <DashboardLayout
      title="Monitoring Ujian Live (Real-Time)"
      actions={
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            {wsConnected ? (
              <>
                <Wifi className="w-4 h-4 text-emerald-600" />
                <span>WebSocket Terhubung</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-amber-600" />
                <span>Menyambungkan...</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => void loadSnapshot()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 bg-white rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Segarkan
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Filter */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-700">Filter Ujian:</label>
            <select
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Semua Ujian</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.exam_code})
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs font-mono-tabular text-slate-600">
            Aktif: {sessions.filter((s) => s.status === 'IN_PROGRESS').length} · Selesai:{' '}
            {sessions.filter((s) => s.status === 'SUBMITTED' || s.status === 'AUTO_SUBMITTED').length}
          </div>
        </div>

        {/* Live Violation Alerts */}
        {liveAlerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-red-800">
              <AlertTriangle className="w-4 h-4" />
              Peringatan Pelanggaran Real-Time
            </div>
            <div className="space-y-1">
              {liveAlerts.map((a) => (
                <p key={a.id} className="text-xs text-red-700 font-mono-tabular">
                  [{a.time}] {a.text}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Monitoring Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Memuat data monitoring...</div>
          ) : sessions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada peserta yang memulai ujian.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Nama Siswa</th>
                    <th className="py-3 px-4 font-semibold">Kelas / Mapel</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Sisa Waktu</th>
                    <th className="py-3 px-4 font-semibold">Dijawab / Belum</th>
                    <th className="py-3 px-4 font-semibold">Pelanggaran</th>
                    <th className="py-3 px-4 font-semibold">Waktu Mulai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{s.student_name}</div>
                        <div className="text-[11px] font-mono-tabular text-slate-500">
                          {s.participant_number}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800">{s.class_name}</div>
                        <div className="text-[11px] text-slate-500">{s.subject_name}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-semibold ${
                            s.status === 'IN_PROGRESS'
                              ? 'text-[#1D4ED8]'
                              : s.status === 'SUBMITTED' || s.status === 'AUTO_SUBMITTED'
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {s.status === 'IN_PROGRESS'
                            ? 'Sedang Mengerjakan'
                            : s.status === 'AUTO_SUBMITTED'
                              ? 'Selesai (Otomatis)'
                              : s.status === 'SUBMITTED'
                                ? 'Selesai'
                                : 'Siap Mulai'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                        {s.status === 'IN_PROGRESS' ? formatSeconds(s.remaining_seconds) : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular">
                        <span className="text-emerald-700 font-semibold">{s.answered_count}</span>
                        {' / '}
                        <span className="text-slate-500">{s.unanswered_count}</span>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular">
                        <span
                          className={`font-bold ${
                            s.violation_count > 0 ? 'text-red-600' : 'text-slate-500'
                          }`}
                        >
                          {s.violation_count}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-xs text-slate-500">
                        {s.started_at ? new Date(s.started_at).toLocaleTimeString('id-ID') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
