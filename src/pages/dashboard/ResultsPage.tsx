import React, { useCallback, useEffect, useState } from 'react';
import { Download, Eye, Printer } from 'lucide-react';
import { OfficialHeader } from '../../components/OfficialHeader';
import { useToast } from '../../components/ToastProvider';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type { Exam, ExamResultRow, SchoolClass } from '../../types';

interface ResultStats {
  count: number;
  highest: number;
  lowest: number;
  average: number;
}

export function ResultsPage() {
  const { showToast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');

  const [results, setResults] = useState<ExamResultRow[]>([]);
  const [stats, setStats] = useState<ResultStats>({ count: 0, highest: 0, lowest: 0, average: 0 });
  const [loading, setLoading] = useState(true);

  const [detailModal, setDetailModal] = useState<{
    session: Record<string, unknown>;
    details: Array<{
      question: { id: number; question_type: string; question_text: string };
      student_answer: unknown;
      is_correct: number | null;
      score_awarded: number;
      max_score: number;
      essay_grade: { feedback: string; grader_name: string } | null;
    }>;
    violations: Array<{ violation_type: string; details: string; occurred_at: string }>;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (examId) q.set('examId', examId);
      if (classId) q.set('classId', classId);
      const [rRes, eRes, cRes] = await Promise.all([
        apiRequest<{ results: ExamResultRow[]; stats: ResultStats }>(`/api/results?${q.toString()}`),
        apiRequest<{ exams: Exam[] }>('/api/exams'),
        apiRequest<{ classes: SchoolClass[] }>('/api/admin/reference/classes'),
      ]);
      setResults(rRes.results);
      setStats(rRes.stats);
      setExams(eRes.exams);
      setClasses(cRes.classes);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [examId, classId, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openDetail = async (id: number) => {
    try {
      const res = await apiRequest<NonNullable<typeof detailModal>>(`/api/results/${id}`);
      setDetailModal(res);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const exportExamId = examId || (exams[0]?.id ? String(exams[0].id) : '');

  return (
    <DashboardLayout
      title="Hasil Ujian & Laporan Nilai"
      actions={
        <div className="flex flex-wrap items-center gap-2 no-print">
          {exportExamId && (
            <>
              <a
                href={`/api/results/export/${exportExamId}?format=xlsx`}
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 bg-white rounded-lg hover:bg-slate-50 text-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                Ekspor Excel
              </a>
              <a
                href={`/api/results/export/${exportExamId}?format=csv`}
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 bg-white rounded-lg hover:bg-slate-50 text-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                Ekspor CSV
              </a>
            </>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak Laporan
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 no-print">
          <select
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Semua Ujian</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title} ({ex.exam_code})
              </option>
            ))}
          </select>

          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Semua Kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Jumlah Peserta</p>
            <p className="mt-1 text-2xl font-display font-bold text-[#0F294A] font-mono-tabular">
              {stats.count}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Nilai Tertinggi</p>
            <p className="mt-1 text-2xl font-display font-bold text-emerald-700 font-mono-tabular">
              {stats.highest}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Nilai Terendah</p>
            <p className="mt-1 text-2xl font-display font-bold text-red-600 font-mono-tabular">
              {stats.lowest}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">Rata-rata Kelas</p>
            <p className="mt-1 text-2xl font-display font-bold text-[#1D4ED8] font-mono-tabular">
              {stats.average}
            </p>
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden print-container">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Memuat hasil ujian...</div>
          ) : results.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada data hasil ujian yang tersedia.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Peringkat</th>
                    <th className="py-3 px-4 font-semibold">Peserta</th>
                    <th className="py-3 px-4 font-semibold">Kelas</th>
                    <th className="py-3 px-4 font-semibold">Ujian</th>
                    <th className="py-3 px-4 font-semibold">Benar / Salah / Kosong</th>
                    <th className="py-3 px-4 font-semibold">Skor Total</th>
                    <th className="py-3 px-4 font-semibold">Pelanggaran</th>
                    <th className="py-3 px-4 font-semibold text-right no-print">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono-tabular font-bold text-[#0F294A]">
                        #{r.rank}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{r.student_name}</div>
                        <div className="text-[11px] font-mono-tabular text-slate-500">
                          {r.participant_number}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{r.class_name}</td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800">{r.exam_title}</div>
                        <div className="text-[11px] text-slate-500">{r.subject_name}</div>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-xs">
                        <span className="text-emerald-700 font-semibold">{r.correct_count}</span>
                        {' / '}
                        <span className="text-red-600 font-semibold">{r.incorrect_count}</span>
                        {' / '}
                        <span className="text-slate-500">{r.unanswered_count}</span>
                      </td>
                      <td className="py-3 px-4 font-mono-tabular font-bold text-slate-900">
                        {r.total_score} / {r.max_score}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular">
                        <span className={r.violation_count > 0 ? 'text-red-600 font-bold' : 'text-slate-500'}>
                          {r.violation_count}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right no-print">
                        <button
                          type="button"
                          onClick={() => void openDetail(r.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1D4ED8] hover:bg-blue-50 rounded-md"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Rincian
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Individual Student Result Detail + Printable View Modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <OfficialHeader variant="print" subtitle="Laporan Hasil Ujian Peserta" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block">Nama Siswa</span>
                <strong className="text-slate-900">{String(detailModal.session.student_name)}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">No. Peserta / Kelas</span>
                <strong className="text-slate-900 font-mono-tabular">
                  {String(detailModal.session.participant_number)} · {String(detailModal.session.class_name)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Skor Total</span>
                <strong className="text-[#0F294A] font-mono-tabular text-sm">
                  {String(detailModal.session.total_score)} / {String(detailModal.session.max_score)}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">Pelanggaran</span>
                <strong className="text-slate-900 font-mono-tabular">
                  {String(detailModal.session.violation_count)} kali
                </strong>
              </div>
            </div>

            <div className="space-y-2.5">
              <h4 className="font-display font-bold text-sm text-slate-900">Rincian Jawaban per Soal</h4>
              {detailModal.details.map((d, i) => (
                <div key={d.question.id} className="p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span>
                      #{i + 1} · {d.question.question_type}
                    </span>
                    <span className="font-mono-tabular text-[#0F294A]">
                      Skor: {d.score_awarded} / {d.max_score}
                    </span>
                  </div>
                  <p className="text-slate-800">{d.question.question_text}</p>
                  <p className="text-slate-600">
                    Jawaban Siswa: <code>{JSON.stringify(d.student_answer)}</code>
                  </p>
                  {d.essay_grade?.feedback && (
                    <p className="text-emerald-700 font-medium">
                      Umpan Balik Guru ({d.essay_grade.grader_name}): {d.essay_grade.feedback}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {detailModal.violations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-display font-bold text-sm text-red-700">Riwayat Pelanggaran</h4>
                <div className="space-y-1 text-xs text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
                  {detailModal.violations.map((v, idx) => (
                    <p key={idx} className="font-mono-tabular">
                      {new Date(v.occurred_at).toLocaleString('id-ID')} — {v.violation_type}: {v.details}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0F294A] text-white rounded-lg"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak
              </button>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
