import React, { useEffect, useState } from 'react';
import { CheckCircle2, Home, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OfficialHeader } from '../../components/OfficialHeader';
import { apiRequest } from '../../services/api';

interface SummaryData {
  session_id: number;
  exam_title: string;
  subject_name: string;
  teacher_name: string;
  student_name: string;
  participant_number: string;
  class_name: string;
  status: string;
  started_at: string;
  submitted_at: string;
  total_score: number;
  max_score: number;
  auto_graded_score: number;
  essay_score: number;
  violation_count: number;
  total_questions: number;
  answered_count: number;
  unanswered_count: number;
  correct_count: number;
  incorrect_count: number;
  essay_pending_count: number;
}

export function ExamResultView({ sessionId }: { sessionId: number }) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ summary: SummaryData }>(`/api/exams/session/${sessionId}/summary`)
      .then((res) => setSummary(res.summary))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <OfficialHeader variant="hero" subtitle="Bukti Penyelesaian & Hasil Ujian Peserta" />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {loading || !summary ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
            Memuat hasil ujian...
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 print-container">
            <div className="text-center space-y-2 border-b border-slate-100 pb-5">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-[#0F294A]">
                Ujian Telah Diselesaikan
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                {summary.exam_title} · {summary.subject_name}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 block text-xs">Nama Siswa</span>
                <strong className="text-slate-900">{summary.student_name}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">Nomor Peserta / Kelas</span>
                <strong className="font-mono-tabular text-slate-900">
                  {summary.participant_number} · {summary.class_name}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">Status Pengiriman</span>
                <strong className="text-emerald-700">
                  {summary.status === 'AUTO_SUBMITTED' ? 'Terkirim Otomatis (Waktu Habis)' : 'Terkirim'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">Waktu Selesai</span>
                <strong className="font-mono-tabular text-slate-900">
                  {summary.submitted_at ? new Date(summary.submitted_at).toLocaleString('id-ID') : '—'}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-4 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500">Skor Saat Ini</p>
                <p className="mt-1 text-2xl font-display font-bold text-[#0F294A] font-mono-tabular">
                  {summary.total_score}
                  <span className="text-sm text-slate-400">/{summary.max_score}</span>
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500">Dijawab</p>
                <p className="mt-1 text-2xl font-display font-bold text-slate-900 font-mono-tabular">
                  {summary.answered_count}/{summary.total_questions}
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500">Benar (Otomatis)</p>
                <p className="mt-1 text-2xl font-display font-bold text-emerald-700 font-mono-tabular">
                  {summary.correct_count}
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500">Pelanggaran</p>
                <p className="mt-1 text-2xl font-display font-bold text-slate-900 font-mono-tabular">
                  {summary.violation_count}
                </p>
              </div>
            </div>

            {summary.essay_pending_count > 0 && (
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                Terdapat <strong>{summary.essay_pending_count} soal esai</strong> yang menunggu penilaian manual dari Guru Mata Pelajaran ({summary.teacher_name}).
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Bukti Ujian
              </button>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg"
              >
                <Home className="w-3.5 h-3.5" />
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
