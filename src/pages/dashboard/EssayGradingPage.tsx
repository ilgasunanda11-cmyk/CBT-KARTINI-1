import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type { ExamResultRow } from '../../types';

interface EssayDetailItem {
  question: {
    id: number;
    question_type: string;
    question_text: string;
    rubric_text: string;
  };
  student_answer: string | null;
  score_awarded: number;
  max_score: number;
  essay_grade: {
    score_awarded: number;
    feedback: string;
    grader_name: string;
    graded_at: string;
  } | null;
}

export function EssayGradingPage() {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<ExamResultRow[]>([]);
  const [selectedSession, setSelectedSession] = useState<ExamResultRow | null>(null);
  const [essayItems, setEssayItems] = useState<EssayDetailItem[]>([]);
  const [scoresMap, setScoresMap] = useState<Record<number, number>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingQId, setSavingQId] = useState<number | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ results: ExamResultRow[] }>('/api/results');
      setSessions(res.results);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const openSessionDetail = async (row: ExamResultRow) => {
    setSelectedSession(row);
    try {
      const res = await apiRequest<{ details: EssayDetailItem[] }>(`/api/results/${row.id}`);
      const essays = res.details.filter((d) => d.question.question_type === 'ESSAY');
      setEssayItems(essays);

      const sInit: Record<number, number> = {};
      const fInit: Record<number, string> = {};
      for (const item of essays) {
        sInit[item.question.id] = item.essay_grade ? item.essay_grade.score_awarded : item.score_awarded;
        fInit[item.question.id] = item.essay_grade ? item.essay_grade.feedback : '';
      }
      setScoresMap(sInit);
      setFeedbackMap(fInit);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSaveGrade = async (questionId: number) => {
    if (!selectedSession) return;
    setSavingQId(questionId);
    try {
      await apiRequest(`/api/results/${selectedSession.id}/grade-essay`, {
        method: 'POST',
        body: JSON.stringify({
          question_id: questionId,
          score_awarded: Number(scoresMap[questionId] ?? 0),
          feedback: feedbackMap[questionId] || '',
        }),
      });
      showToast('Nilai esai dan umpan balik berhasil disimpan.', 'success');
      await openSessionDetail(selectedSession);
      void loadSessions();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingQId(null);
    }
  };

  return (
    <DashboardLayout title="Koreksi Jawaban Esai">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Session List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 font-display font-bold text-sm text-slate-900">
            Daftar Pengumpulan Peserta
          </div>
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-500">Memuat daftar peserta...</div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Belum ada peserta yang menyelesaikan ujian.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[650px] overflow-y-auto">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void openSessionDetail(s)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${
                    selectedSession?.id === s.id ? 'bg-blue-50/60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-slate-900">{s.student_name}</span>
                    <span className="text-xs font-mono-tabular font-bold text-[#0F294A]">
                      {s.total_score}/{s.max_score}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 flex items-center justify-between">
                    <span>
                      {s.class_name} · {s.exam_title}
                    </span>
                    {s.pending_essay_count > 0 && (
                      <span className="text-amber-700 font-semibold">
                        {s.pending_essay_count} belum dinilai
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grading Pane */}
        <div className="lg:col-span-7 space-y-4">
          {!selectedSession ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              Pilih peserta di sebelah kiri untuk mengoreksi jawaban esai.
            </div>
          ) : essayItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Ujian ini tidak memiliki soal bertipe Esai.
            </div>
          ) : (
            essayItems.map((item, idx) => (
              <div key={item.question.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <span className="font-display font-bold text-sm text-[#0F294A]">
                    Soal Esai #{idx + 1} (Maks. Skor: {item.max_score})
                  </span>
                  {item.essay_grade && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Sudah Dinilai
                    </span>
                  )}
                </div>

                <p className="text-sm font-medium text-slate-900 whitespace-pre-line">
                  {item.question.question_text}
                </p>

                {item.question.rubric_text && (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    <strong>Rubrik Penilaian:</strong> {item.question.rubric_text}
                  </div>
                )}

                <div className="p-4 rounded-lg bg-blue-50/40 border border-blue-200">
                  <p className="text-[11px] font-bold text-[#0F294A] mb-1">Jawaban Siswa:</p>
                  <p className="text-sm text-slate-900 whitespace-pre-line">
                    {item.student_answer ? String(item.student_answer) : '(Siswa tidak mengisi jawaban)'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Skor Diberikan (0 – {item.max_score})
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={item.max_score}
                      step={0.5}
                      value={scoresMap[item.question.id] ?? 0}
                      onChange={(e) =>
                        setScoresMap((prev) => ({
                          ...prev,
                          [item.question.id]: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Umpan Balik Guru (Opsional)
                    </label>
                    <input
                      type="text"
                      value={feedbackMap[item.question.id] ?? ''}
                      onChange={(e) =>
                        setFeedbackMap((prev) => ({
                          ...prev,
                          [item.question.id]: e.target.value,
                        }))
                      }
                      placeholder="Catatan atau evaluasi untuk siswa..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={savingQId === item.question.id}
                    onClick={() => void handleSaveGrade(item.question.id)}
                    className="px-4 py-2 text-xs font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg disabled:opacity-50"
                  >
                    {savingQId === item.question.id ? 'Menyimpan...' : 'Simpan Nilai Esai'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
