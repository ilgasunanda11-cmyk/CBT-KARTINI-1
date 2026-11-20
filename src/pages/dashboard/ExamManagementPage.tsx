import React, { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Edit3, Plus, Square, Trash2 } from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type { Exam, Question, SchoolClass, Subject } from '../../types';

export function ExamManagementPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teachers, setTeachers] = useState<Array<{ id: number; full_name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [eligibleClassIds, setEligibleClassIds] = useState<number[]>([]);
  const [teacherUserId, setTeacherUserId] = useState<number | ''>('');
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('23:59');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [examCode, setExamCode] = useState('');
  const [questionCount, setQuestionCount] = useState(0);
  const [randomizeQuestions, setRandomizeQuestions] = useState(true);
  const [randomizeOptions, setRandomizeOptions] = useState(true);
  const [instructions, setInstructions] = useState('Bacalah setiap soal dengan teliti sebelum memilih jawaban.');
  const [isPublished, setIsPublished] = useState(true);
  const [allowAudioReplay, setAllowAudioReplay] = useState(true);
  const [maxAudioReplays, setMaxAudioReplays] = useState(3);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, sRes, cRes, qRes, tRes] = await Promise.all([
        apiRequest<{ exams: Exam[] }>('/api/exams'),
        apiRequest<{ subjects: Subject[] }>('/api/admin/reference/subjects'),
        apiRequest<{ classes: SchoolClass[] }>('/api/admin/reference/classes'),
        apiRequest<{ questions: Question[] }>('/api/questions'),
        apiRequest<{ teachers: Array<{ id: number; full_name: string }> }>('/api/admin/reference/teachers'),
      ]);
      setExams(eRes.exams);
      setSubjects(sRes.subjects);
      setClasses(cRes.classes);
      setQuestions(qRes.questions);
      setTeachers(tRes.teachers);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingExam(null);
    setTitle('');
    setSubjectId(subjects[0]?.id || '');
    setEligibleClassIds(classes.length > 0 ? [classes[0].id] : []);
    setTeacherUserId(user?.id || '');
    setExamDate(new Date().toISOString().slice(0, 10));
    setStartTime('07:30');
    setEndTime('23:59');
    setDurationMinutes(60);
    setExamCode(`KRT${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
    setQuestionCount(0);
    setRandomizeQuestions(true);
    setRandomizeOptions(true);
    setInstructions('Bacalah setiap soal dengan teliti. Dilarang membuka tab lain selama ujian berlangsung.');
    setIsPublished(true);
    setAllowAudioReplay(true);
    setMaxAudioReplays(3);
    setSelectedQuestionIds([]);
    setModalOpen(true);
  };

  const openEditModal = async (ex: Exam) => {
    setEditingExam(ex);
    setTitle(ex.title);
    setSubjectId(ex.subject_id);
    try {
      const parsed = JSON.parse(ex.eligible_class_ids_json || '[]') as number[];
      setEligibleClassIds(parsed.length > 0 ? parsed : ex.class_id ? [ex.class_id] : []);
    } catch {
      setEligibleClassIds(ex.class_id ? [ex.class_id] : []);
    }
    setTeacherUserId(ex.teacher_user_id);
    setExamDate(ex.exam_date);
    setStartTime(ex.start_time);
    setEndTime(ex.end_time);
    setDurationMinutes(ex.duration_minutes);
    setExamCode(ex.exam_code);
    setQuestionCount(ex.question_count);
    setRandomizeQuestions(Boolean(ex.randomize_questions));
    setRandomizeOptions(Boolean(ex.randomize_options));
    setInstructions(ex.instructions || '');
    setIsPublished(Boolean(ex.is_published));
    setAllowAudioReplay(Boolean(ex.allow_audio_replay));
    setMaxAudioReplays(ex.max_audio_replays);

    try {
      const detail = await apiRequest<{ questions: Array<{ id: number }> }>(`/api/exams/${ex.id}`);
      setSelectedQuestionIds(detail.questions.map((q) => q.id));
    } catch {
      setSelectedQuestionIds([]);
    }
    setModalOpen(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subjectId || !examCode.trim()) {
      showToast('Judul, mata pelajaran, dan kode ujian wajib diisi.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        subject_id: Number(subjectId),
        class_id: eligibleClassIds[0] ?? null,
        eligible_class_ids: eligibleClassIds,
        teacher_user_id: isAdmin && teacherUserId ? Number(teacherUserId) : user?.id,
        exam_date: examDate,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: Number(durationMinutes),
        exam_code: examCode.trim().toUpperCase(),
        question_count: questionCount > 0 ? Number(questionCount) : selectedQuestionIds.length,
        randomize_questions: randomizeQuestions,
        randomize_options: randomizeOptions,
        instructions,
        is_published: isPublished,
        allow_audio_replay: allowAudioReplay,
        max_audio_replays: Number(maxAudioReplays),
        question_ids: selectedQuestionIds,
      };

      if (editingExam) {
        await apiRequest(`/api/exams/${editingExam.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Ujian berhasil diperbarui.', 'success');
      } else {
        await apiRequest('/api/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Ujian baru berhasil dibuat.', 'success');
      }
      setModalOpen(false);
      void loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/exams/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Ujian berhasil dihapus.', 'success');
      setDeleteTarget(null);
      void loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const toggleClass = (cid: number) => {
    setEligibleClassIds((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  };

  const toggleQuestion = (qid: number) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
    );
  };

  const filteredQuestionsForSubject = subjectId
    ? questions.filter((q) => q.subject_id === Number(subjectId))
    : questions;

  return (
    <DashboardLayout
      title="Manajemen Ujian"
      actions={
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Buat Ujian Baru
        </button>
      }
    >
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Memuat daftar ujian...
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-slate-600">Belum ada jadwal ujian dibuat.</p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] text-white"
          >
            + Buat Ujian Pertama
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Judul Ujian</th>
                  <th className="py-3 px-4 font-semibold">Mapel</th>
                  <th className="py-3 px-4 font-semibold">Kode Ujian</th>
                  <th className="py-3 px-4 font-semibold">Tanggal & Jam</th>
                  <th className="py-3 px-4 font-semibold">Durasi / Soal</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{ex.title}</div>
                      <div className="text-[11px] text-slate-500">Pengajar: {ex.teacher_name}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{ex.subject_name}</td>
                    <td className="py-3 px-4 font-mono-tabular font-bold text-[#0F294A]">
                      {ex.exam_code}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-600">
                      {ex.exam_date} · {ex.start_time}–{ex.end_time}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-600">
                      {ex.duration_minutes} mnt · {ex.assigned_question_count ?? ex.question_count} soal
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          ex.is_published ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {ex.is_published ? 'Terpublikasi' : 'Draf'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void openEditModal(ex)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1D4ED8] hover:bg-blue-50 rounded-md mr-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(ex)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Exam Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveExam}
            className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5"
          >
            <h2 className="font-display font-bold text-lg text-slate-900 border-b border-slate-200 pb-3">
              {editingExam ? 'Edit Konfigurasi Ujian' : 'Buat Ujian Baru'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Ujian</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Penilaian Tengah Semester Bahasa Inggris"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                <select
                  required
                  value={subjectId}
                  onChange={(e) => setSubjectId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Ujian</label>
                <input
                  type="text"
                  required
                  value={examCode}
                  onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-sm font-mono-tabular font-bold border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Durasi (Menit)</label>
                <input
                  type="number"
                  min={1}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Ujian</label>
                <input
                  type="date"
                  required
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Guru Penanggung Jawab</label>
                  <select
                    value={teacherUserId}
                    onChange={(e) => setTeacherUserId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batas Putar Audio per Soal (0 = tanpa batas)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxAudioReplays}
                  onChange={(e) => setMaxAudioReplays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Eligible Classes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Kelas Peserta yang Diizinkan
              </label>
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => {
                  const checked = eligibleClassIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleClass(c.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        checked
                          ? 'bg-[#0F294A] border-[#0F294A] text-white'
                          : 'bg-white border-slate-300 text-slate-700'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={randomizeQuestions}
                  onChange={(e) => setRandomizeQuestions(e.target.checked)}
                />
                Acak urutan soal untuk setiap peserta
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={randomizeOptions}
                  onChange={(e) => setRandomizeOptions(e.target.checked)}
                />
                Acak urutan opsi jawaban (A–E)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowAudioReplay}
                  onChange={(e) => setAllowAudioReplay(e.target.checked)}
                />
                Izinkan pemutaran ulang audio soal
              </label>
              <label className="flex items-center gap-2 font-semibold text-[#0F294A]">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                />
                Publikasikan ujian agar dapat diikuti siswa
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Petunjuk Ujian</label>
              <textarea
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {/* Question Selector */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Pilih Soal untuk Ujian Ini ({selectedQuestionIds.length} terpilih)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedQuestionIds(
                      selectedQuestionIds.length === filteredQuestionsForSubject.length
                        ? []
                        : filteredQuestionsForSubject.map((q) => q.id)
                    )
                  }
                  className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                >
                  {selectedQuestionIds.length === filteredQuestionsForSubject.length
                    ? 'Hapus Semua Pilihan'
                    : 'Pilih Semua Soal Mapel Ini'}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredQuestionsForSubject.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500 text-center">
                    Belum ada soal pada mata pelajaran ini.
                  </p>
                ) : (
                  filteredQuestionsForSubject.map((q) => {
                    const checked = selectedQuestionIds.includes(q.id);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => toggleQuestion(q.id)}
                        className="w-full py-2 px-2 flex items-start gap-2.5 text-left hover:bg-slate-50"
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800 line-clamp-1">
                            {q.question_text}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {q.question_type} · Skor {q.default_score}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg"
              >
                {saving ? 'Menyimpan...' : 'Simpan Ujian'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Ujian"
        message={`Hapus ujian "${deleteTarget?.title}"? Seluruh sesi terkait ujian ini akan ikut terhapus.`}
        confirmLabel="Hapus Ujian"
        variant="danger"
        onConfirm={() => void handleDeleteExam()}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
