import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckSquare,
  Copy,
  Edit3,
  Image as ImageIcon,
  Music,
  Plus,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AudioPlayer } from '../../components/AudioPlayer';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest, getMediaFileUrl } from '../../services/api';
import type { Exam, Question, QuestionBank, SchoolClass, Subject } from '../../types';

const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: 'Pilihan Ganda',
  MULTIPLE_SELECT: 'Pilihan Ganda Kompleks',
  MATCHING: 'Menjodohkan',
  TRUE_FALSE: 'Benar / Salah',
  ESSAY: 'Esai / Uraian',
};

export function QuestionBankPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const basePath = user?.role === 'ADMIN' ? '/admin' : '/teacher';

  const [questions, setQuestions] = useState<Question[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [bankId, setBankId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [mediaFilter, setMediaFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);

  // Add to exam modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [targetExamId, setTargetExamId] = useState('');

  // Create bank modal
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [newBankTitle, setNewBankTitle] = useState('');
  const [newBankSubject, setNewBankSubject] = useState('');
  const [newBankShared, setNewBankShared] = useState(true);

  const loadRefs = useCallback(async () => {
    try {
      const [bRes, sRes, cRes, eRes] = await Promise.all([
        apiRequest<{ banks: QuestionBank[] }>('/api/questions/banks'),
        apiRequest<{ subjects: Subject[] }>('/api/admin/reference/subjects'),
        apiRequest<{ classes: SchoolClass[] }>('/api/admin/reference/classes'),
        apiRequest<{ exams: Exam[] }>('/api/exams'),
      ]);
      setBanks(bRes.banks);
      setSubjects(sRes.subjects);
      setClasses(cRes.classes);
      setExams(eRes.exams);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [showToast]);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (bankId) q.set('bankId', bankId);
      if (subjectId) q.set('subjectId', subjectId);
      if (classId) q.set('classId', classId);
      if (typeFilter) q.set('type', typeFilter);
      if (mediaFilter) q.set('hasMedia', mediaFilter);
      const res = await apiRequest<{ questions: Question[] }>(`/api/questions?${q.toString()}`);
      setQuestions(res.questions);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [search, bankId, subjectId, classId, typeFilter, mediaFilter, showToast]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDuplicate = async (q: Question) => {
    try {
      await apiRequest(`/api/questions/${q.id}/duplicate`, { method: 'POST' });
      showToast('Soal berhasil diduplikasi.', 'success');
      void loadQuestions();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/questions/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Soal berhasil dihapus.', 'success');
      setDeleteTarget(null);
      setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
      void loadQuestions();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/questions/banks', {
        method: 'POST',
        body: JSON.stringify({
          title: newBankTitle,
          subject_id: Number(newBankSubject),
          is_shared: newBankShared,
        }),
      });
      showToast('Bank soal baru berhasil dibuat.', 'success');
      setBankModalOpen(false);
      setNewBankTitle('');
      void loadRefs();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleAddToExam = async () => {
    if (!targetExamId || selectedIds.length === 0) return;
    try {
      const exDetail = await apiRequest<{ questions: Array<{ id: number }> }>(`/api/exams/${targetExamId}`);
      const existingIds = exDetail.questions.map((q) => q.id);
      const merged = Array.from(new Set([...existingIds, ...selectedIds]));
      await apiRequest(`/api/exams/${targetExamId}`, {
        method: 'PUT',
        body: JSON.stringify({ question_ids: merged, question_count: merged.length }),
      });
      showToast(`${selectedIds.length} soal ditambahkan ke ujian.`, 'success');
      setAssignModalOpen(false);
      setSelectedIds([]);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <DashboardLayout
      title="Bank Soal Terpusat"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBankModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 whitespace-nowrap shrink-0"
          >
            + Bank Soal Baru
          </button>
          <Link
            to={`${basePath}/import`}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 whitespace-nowrap shrink-0"
          >
            Impor Excel/CSV/Word
          </Link>
          <Link
            to={`${basePath}/questions/new`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Buat Soal Baru
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Filter Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari teks pertanyaan..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
          </div>

          <select
            value={bankId}
            onChange={(e) => setBankId(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Semua Bank Soal</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>

          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Semua Mapel</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Semua Kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Semua Tipe Soal</option>
            <option value="MULTIPLE_CHOICE">Pilihan Ganda</option>
            <option value="MULTIPLE_SELECT">Pilihan Ganda Kompleks</option>
            <option value="MATCHING">Menjodohkan</option>
            <option value="TRUE_FALSE">Benar / Salah</option>
            <option value="ESSAY">Esai</option>
          </select>

          <select
            value={mediaFilter}
            onChange={(e) => setMediaFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Semua Media</option>
            <option value="ANY">Memiliki Media</option>
            <option value="IMAGE">Memiliki Gambar</option>
            <option value="AUDIO">Memiliki Audio</option>
          </select>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div className="bg-[#0F294A] text-white rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold font-mono-tabular">
              {selectedIds.length} soal dipilih
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAssignModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#1D4ED8] hover:bg-blue-500 rounded-lg whitespace-nowrap"
              >
                Tambahkan ke Ujian
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-3 py-1.5 text-xs text-blue-100 hover:text-white"
              >
                Batal Pilih
              </button>
            </div>
          </div>
        )}

        {/* Question List */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            Memuat bank soal...
          </div>
        ) : questions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <p className="text-sm text-slate-600">Tidak ada soal ditemukan sesuai filter.</p>
            <Link
              to={`${basePath}/questions/new`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Buat Soal Pertama
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => {
              const isSelected = selectedIds.includes(q.id);
              const allMediaCount =
                (q.media?.length || 0) +
                (q.options?.reduce((acc, o) => acc + (o.media?.length || 0), 0) || 0) +
                (q.matching_pairs?.reduce(
                  (acc, p) => acc + (p.left_media?.length || 0) + (p.right_media?.length || 0),
                  0
                ) || 0);

              const hasImg =
                q.media?.some((m) => m.media_type === 'IMAGE') ||
                q.options?.some((o) => o.media?.some((m) => m.media_type === 'IMAGE'));
              const hasAud =
                q.media?.some((m) => m.media_type === 'AUDIO') ||
                q.options?.some((o) => o.media?.some((m) => m.media_type === 'AUDIO'));

              return (
                <div
                  key={q.id}
                  className={`bg-white border rounded-xl p-4 sm:p-5 transition-colors ${
                    isSelected ? 'border-[#1D4ED8] bg-blue-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelect(q.id)}
                      className="mt-0.5 text-slate-400 hover:text-[#1D4ED8] shrink-0"
                      aria-label="Pilih soal"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-[#1D4ED8]" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                        <span className="font-semibold text-[#0F294A]">
                          {TYPE_LABELS[q.question_type] || q.question_type}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{q.subject_name}</span>
                        {q.class_name && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{q.class_name}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">Skor: {q.default_score}</span>
                        {allMediaCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-[#1D4ED8] font-medium">
                              {hasImg && <ImageIcon className="w-3.5 h-3.5" />}
                              {hasAud && <Music className="w-3.5 h-3.5" />}
                              {allMediaCount} media
                            </span>
                          </>
                        )}
                      </div>

                      <p className="text-sm font-medium text-slate-900 whitespace-pre-line">
                        {q.question_text}
                      </p>

                      {/* Inline media preview */}
                      {q.media && q.media.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-3">
                          {q.media.map((m, idx) =>
                            m.media_type === 'IMAGE' ? (
                              <img
                                key={`${m.media_id}_${idx}`}
                                src={getMediaFileUrl(m.media_id)}
                                alt={m.alt_text || 'Gambar soal'}
                                className="h-24 w-auto object-contain rounded border border-slate-200 bg-slate-50"
                              />
                            ) : (
                              <div key={`${m.media_id}_${idx}`} className="w-full max-w-sm">
                                <AudioPlayer src={getMediaFileUrl(m.media_id)} title={m.original_name} compact />
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                        <span className="text-[11px] text-slate-500">
                          Bank: {q.bank_title} · Pembuat: {q.creator_name}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewQuestion(q)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                          >
                            Pratinjau
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`${basePath}/questions/${q.id}/edit`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1D4ED8] border border-blue-200 rounded-md hover:bg-blue-50"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDuplicate(q)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Duplikasi
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(q)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display font-bold text-base text-slate-900">
                Pratinjau Soal · {TYPE_LABELS[previewQuestion.question_type]}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewQuestion(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Tutup
              </button>
            </div>

            {previewQuestion.instructions && (
              <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                Petunjuk: {previewQuestion.instructions}
              </p>
            )}

            <p className="text-sm text-slate-900 font-medium whitespace-pre-line">
              {previewQuestion.question_text}
            </p>

            {previewQuestion.media?.map((m, idx) =>
              m.media_type === 'IMAGE' ? (
                <img
                  key={idx}
                  src={getMediaFileUrl(m.media_id)}
                  alt={m.alt_text || 'Gambar'}
                  className="max-h-60 object-contain rounded border border-slate-200"
                />
              ) : (
                <AudioPlayer key={idx} src={getMediaFileUrl(m.media_id)} title={m.original_name} />
              )
            )}

            {previewQuestion.options && previewQuestion.options.length > 0 && (
              <div className="space-y-2">
                {previewQuestion.options.map((o) => (
                  <div
                    key={o.option_key}
                    className={`p-3 rounded-lg border text-sm ${
                      o.is_correct ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <strong className="mr-2">{o.option_key}.</strong>
                        {o.option_text}
                      </span>
                      {Boolean(o.is_correct) && (
                        <span className="text-xs font-semibold text-emerald-700">Kunci Benar</span>
                      )}
                    </div>
                    {o.media && o.media.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {o.media.map((om, mIdx) =>
                          om.media_type === 'IMAGE' ? (
                            <img
                              key={mIdx}
                              src={getMediaFileUrl(om.media_id)}
                              alt={om.alt_text || 'Media opsi'}
                              className="h-20 object-contain rounded border"
                            />
                          ) : (
                            <AudioPlayer key={mIdx} src={getMediaFileUrl(om.media_id)} compact />
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {previewQuestion.matching_pairs && previewQuestion.matching_pairs.length > 0 && (
              <div className="space-y-2">
                {previewQuestion.matching_pairs.map((p) => (
                  <div key={p.pair_key} className="grid grid-cols-2 gap-3 p-2.5 border border-slate-200 rounded-lg text-xs">
                    <div>
                      <strong>{p.pair_key}.</strong> {p.left_text}
                    </div>
                    <div>
                      <strong>{p.right_key}.</strong> {p.right_text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Bank Modal */}
      {bankModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleCreateBank} className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900">Buat Bank Soal Baru</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Bank Soal</label>
              <input
                type="text"
                required
                value={newBankTitle}
                onChange={(e) => setNewBankTitle(e.target.value)}
                placeholder="Contoh: Bank Soal UTS Matematika Kelas VIII"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
              <select
                required
                value={newBankSubject}
                onChange={(e) => setNewBankSubject(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Pilih Mata Pelajaran</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newBankShared}
                onChange={(e) => setNewBankShared(e.target.checked)}
              />
              Bagikan bank soal dengan guru lain yang berwenang
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBankModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-[#0F294A] text-white rounded-lg"
              >
                Simpan Bank Soal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Assign to Exam Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900">
              Tambahkan {selectedIds.length} Soal ke Ujian
            </h3>
            <select
              value={targetExamId}
              onChange={(e) => setTargetExamId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Pilih Ujian Tujuan</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.exam_code})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!targetExamId}
                onClick={() => void handleAddToExam()}
                className="px-4 py-2 text-xs font-semibold bg-[#0F294A] text-white rounded-lg disabled:opacity-50"
              >
                Tambahkan
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Soal"
        message="Apakah Anda yakin ingin menghapus soal ini dari Bank Soal? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus Soal"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
