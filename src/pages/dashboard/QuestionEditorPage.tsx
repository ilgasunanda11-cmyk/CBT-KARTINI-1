import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { QuestionMediaBlock } from '../../components/QuestionMediaBlock';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type {
  AttachedMedia,
  MatchingPair,
  Question,
  QuestionBank,
  QuestionOption,
  QuestionType,
  SchoolClass,
  Subject,
} from '../../types';

const DEFAULT_OPTIONS: QuestionOption[] = [
  { option_key: 'A', option_text: '', is_correct: true, media: [] },
  { option_key: 'B', option_text: '', is_correct: false, media: [] },
  { option_key: 'C', option_text: '', is_correct: false, media: [] },
  { option_key: 'D', option_text: '', is_correct: false, media: [] },
];

const DEFAULT_PAIRS: MatchingPair[] = [
  { pair_key: '1', left_text: '', right_key: 'A', right_text: '', score: 10, left_media: [], right_media: [] },
  { pair_key: '2', left_text: '', right_key: 'B', right_text: '', score: 10, left_media: [], right_media: [] },
  { pair_key: '3', left_text: '', right_key: 'C', right_text: '', score: 10, left_media: [], right_media: [] },
];

export function QuestionEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const basePath = user?.role === 'ADMIN' ? '/admin' : '/teacher';

  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bankId, setBankId] = useState<number | ''>('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [classId, setClassId] = useState<number | ''>('');
  const [questionType, setQuestionType] = useState<QuestionType>('MULTIPLE_CHOICE');
  const [questionText, setQuestionText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [defaultScore, setDefaultScore] = useState(10);
  const [partialCredit, setPartialCredit] = useState(true);
  const [rubricText, setRubricText] = useState('');

  // Multi-placement question media
  const [mainMedia, setMainMedia] = useState<AttachedMedia[]>([]);
  const [instructionMedia, setInstructionMedia] = useState<AttachedMedia[]>([]);
  const [supportingMedia, setSupportingMedia] = useState<AttachedMedia[]>([]);

  // Options (MC / MS)
  const [options, setOptions] = useState<QuestionOption[]>(DEFAULT_OPTIONS);
  // True/False
  const [tfAnswer, setTfAnswer] = useState<'TRUE' | 'FALSE'>('TRUE');
  // Matching
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>(DEFAULT_PAIRS);

  useEffect(() => {
    const loadInit = async () => {
      try {
        const [bRes, sRes, cRes] = await Promise.all([
          apiRequest<{ banks: QuestionBank[] }>('/api/questions/banks'),
          apiRequest<{ subjects: Subject[] }>('/api/admin/reference/subjects'),
          apiRequest<{ classes: SchoolClass[] }>('/api/admin/reference/classes'),
        ]);
        setBanks(bRes.banks);
        setSubjects(sRes.subjects);
        setClasses(cRes.classes);

        if (bRes.banks.length > 0 && !isEdit) {
          setBankId(bRes.banks[0].id);
          setSubjectId(bRes.banks[0].subject_id);
        } else if (sRes.subjects.length > 0 && !isEdit) {
          setSubjectId(sRes.subjects[0].id);
        }

        if (isEdit && id) {
          const qRes = await apiRequest<{ question: Question }>(`/api/questions/${id}`);
          const q = qRes.question;
          setBankId(q.bank_id);
          setSubjectId(q.subject_id);
          setClassId(q.class_id || '');
          setQuestionType(q.question_type);
          setQuestionText(q.question_text);
          setInstructions(q.instructions || '');
          setDefaultScore(q.default_score);
          setPartialCredit(q.partial_credit === 1);
          setRubricText(q.rubric_text || '');

          setMainMedia(
            (q.media || []).filter((m) => m.placement === 'MAIN_QUESTION' || m.placement === 'STATEMENT')
          );
          setInstructionMedia((q.media || []).filter((m) => m.placement === 'INSTRUCTIONS'));
          setSupportingMedia((q.media || []).filter((m) => m.placement === 'SUPPORTING_MATERIAL'));

          if (q.question_type === 'MULTIPLE_CHOICE' || q.question_type === 'MULTIPLE_SELECT') {
            setOptions(
              q.options.map((o) => ({
                ...o,
                is_correct: Boolean(o.is_correct),
                media: o.media || [],
              }))
            );
          } else if (q.question_type === 'TRUE_FALSE') {
            try {
              const ca = JSON.parse(q.correct_answer_json || '{}') as { correctValue?: string };
              setTfAnswer(ca.correctValue === 'FALSE' ? 'FALSE' : 'TRUE');
            } catch {
              setTfAnswer('TRUE');
            }
          } else if (q.question_type === 'MATCHING') {
            setMatchingPairs(
              q.matching_pairs.map((p) => ({
                ...p,
                left_media: p.left_media || [],
                right_media: p.right_media || [],
              }))
            );
          }
        }
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    void loadInit();
  }, [id, isEdit, showToast]);

  const addOptionE = () => {
    if (options.some((o) => o.option_key === 'E')) return;
    setOptions([...options, { option_key: 'E', option_text: '', is_correct: false, media: [] }]);
  };

  const removeOptionE = () => {
    setOptions(options.filter((o) => o.option_key !== 'E'));
  };

  const addMatchingPair = () => {
    const nextNum = matchingPairs.length + 1;
    const nextLetter = String.fromCharCode(64 + nextNum);
    setMatchingPairs([
      ...matchingPairs,
      {
        pair_key: String(nextNum),
        left_text: '',
        right_key: nextLetter,
        right_text: '',
        score: 10,
        left_media: [],
        right_media: [],
      },
    ]);
  };

  const removeMatchingPair = (idx: number) => {
    if (matchingPairs.length <= 2) return;
    const next = matchingPairs
      .filter((_, i) => i !== idx)
      .map((p, i) => ({
        ...p,
        pair_key: String(i + 1),
        right_key: String.fromCharCode(65 + i),
      }));
    setMatchingPairs(next);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankId || !subjectId || !questionText.trim()) {
      showToast('Bank soal, mata pelajaran, dan teks pertanyaan wajib diisi.', 'error');
      return;
    }

    let correctAnswerJson: Record<string, unknown> = {};
    let payloadOptions: QuestionOption[] = [];
    let payloadPairs: MatchingPair[] = [];

    if (questionType === 'MULTIPLE_CHOICE') {
      const correctOpt = options.find((o) => Boolean(o.is_correct));
      if (!correctOpt) {
        showToast('Pilih satu kunci jawaban yang benar.', 'error');
        return;
      }
      correctAnswerJson = { correctKey: correctOpt.option_key };
      payloadOptions = options;
    } else if (questionType === 'MULTIPLE_SELECT') {
      const correctKeys = options.filter((o) => Boolean(o.is_correct)).map((o) => o.option_key);
      if (correctKeys.length === 0) {
        showToast('Pilih minimal satu kunci jawaban yang benar.', 'error');
        return;
      }
      correctAnswerJson = { correctKeys };
      payloadOptions = options;
    } else if (questionType === 'TRUE_FALSE') {
      correctAnswerJson = { correctValue: tfAnswer };
      payloadOptions = [
        { option_key: 'TRUE', option_text: 'BENAR (TRUE)', is_correct: tfAnswer === 'TRUE', media: [] },
        { option_key: 'FALSE', option_text: 'SALAH (FALSE)', is_correct: tfAnswer === 'FALSE', media: [] },
      ];
    } else if (questionType === 'MATCHING') {
      const pairMap: Record<string, string> = {};
      for (const p of matchingPairs) {
        if (!p.left_text.trim() && !(p.left_media && p.left_media.length > 0)) {
          showToast(`Item Kolom A #${p.pair_key} wajib memiliki teks atau media.`, 'error');
          return;
        }
        if (!p.right_text.trim() && !(p.right_media && p.right_media.length > 0)) {
          showToast(`Item Kolom B #${p.right_key} wajib memiliki teks atau media.`, 'error');
          return;
        }
        pairMap[p.pair_key] = p.right_key;
      }
      correctAnswerJson = { pairs: pairMap };
      payloadPairs = matchingPairs;
    } else if (questionType === 'ESSAY') {
      correctAnswerJson = { manualGrading: true };
    }

    const combinedMedia = [
      ...mainMedia.map((m, idx) => ({
        ...m,
        placement: questionType === 'TRUE_FALSE' ? 'STATEMENT' : 'MAIN_QUESTION',
        sort_order: idx,
      })),
      ...instructionMedia.map((m, idx) => ({
        ...m,
        placement: 'INSTRUCTIONS',
        sort_order: idx,
      })),
      ...supportingMedia.map((m, idx) => ({
        ...m,
        placement: 'SUPPORTING_MATERIAL',
        sort_order: idx,
      })),
    ];

    setSaving(true);
    try {
      const payload = {
        bank_id: Number(bankId),
        subject_id: Number(subjectId),
        class_id: classId ? Number(classId) : null,
        question_type: questionType,
        question_text: questionText.trim(),
        instructions: instructions.trim(),
        correct_answer_json: correctAnswerJson,
        partial_credit: partialCredit,
        default_score: Number(defaultScore || 10),
        rubric_text: rubricText.trim(),
        media: combinedMedia,
        options: payloadOptions,
        matching_pairs: payloadPairs,
      };

      if (isEdit && id) {
        await apiRequest(`/api/questions/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Soal berhasil diperbarui.', 'success');
      } else {
        await apiRequest('/api/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Soal baru berhasil disimpan ke Bank Soal.', 'success');
      }
      navigate(`${basePath}/questions`);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title={isEdit ? 'Edit Soal' : 'Buat Soal Baru'}>
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Memuat editor soal...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={isEdit ? 'Edit Soal' : 'Buat Soal Baru'}
      actions={
        <button
          type="button"
          onClick={() => navigate(`${basePath}/questions`)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Kembali ke Bank Soal
        </button>
      }
    >
      <form onSubmit={handleSave} className="space-y-6">
        {/* Metadata & Question Type */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Soal</label>
              <select
                required
                value={bankId}
                onChange={(e) => setBankId(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Pilih Bank Soal</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
              <select
                required
                value={subjectId}
                onChange={(e) => setSubjectId(Number(e.target.value))}
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas (Opsional)</label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Semua Kelas</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Skor Maksimal</label>
              <input
                type="number"
                min={1}
                step={0.5}
                value={defaultScore}
                onChange={(e) => setDefaultScore(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Tipe Pertanyaan</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(
                [
                  { id: 'MULTIPLE_CHOICE', label: 'Pilihan Ganda' },
                  { id: 'MULTIPLE_SELECT', label: 'Pilihan Ganda Kompleks' },
                  { id: 'MATCHING', label: 'Menjodohkan' },
                  { id: 'TRUE_FALSE', label: 'Benar / Salah' },
                  { id: 'ESSAY', label: 'Esai / Uraian' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setQuestionType(t.id)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    questionType === t.id
                      ? 'bg-[#0F294A] border-[#0F294A] text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Instructions + Main Question + Supporting Media */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Petunjuk Soal (Opsional)
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Contoh: Dengarkan audio percakapan berikut sebelum menjawab pertanyaan."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
            <QuestionMediaBlock
              label="Media Petunjuk Soal (Gambar / Audio)"
              items={instructionMedia}
              onChange={setInstructionMedia}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              {questionType === 'TRUE_FALSE' ? 'Pernyataan Benar / Salah' : 'Teks Pertanyaan Utama'}
            </label>
            <textarea
              required
              rows={4}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Tuliskan isi pertanyaan secara lengkap..."
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            />
            <QuestionMediaBlock
              label={
                questionType === 'TRUE_FALSE'
                  ? 'Media Pernyataan Benar/Salah (Gambar & Audio Simultan Didukung)'
                  : 'Media Pertanyaan Utama (Gambar & Audio Simultan Didukung)'
              }
              items={mainMedia}
              onChange={setMainMedia}
            />
          </div>

          {questionType === 'ESSAY' && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <QuestionMediaBlock
                label="Materi Pendukung Esai (Gambar / Audio Referensi)"
                items={supportingMedia}
                onChange={setSupportingMedia}
              />
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rubrik Penilaian Esai (Panduan Koreksi Guru)
                </label>
                <textarea
                  rows={3}
                  value={rubricText}
                  onChange={(e) => setRubricText(e.target.value)}
                  placeholder="Tuliskan kriteria penilaian skor penuh dan parsial..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}
        </div>

        {/* Type-specific Answer Configuration */}
        {(questionType === 'MULTIPLE_CHOICE' || questionType === 'MULTIPLE_SELECT') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">
                  Opsi Jawaban (Teks, Gambar, dan Audio)
                </h3>
                <p className="text-xs text-slate-500">
                  {questionType === 'MULTIPLE_CHOICE'
                    ? 'Tandai satu opsi sebagai jawaban yang benar.'
                    : 'Tandai lebih dari satu opsi sebagai jawaban yang benar.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {questionType === 'MULTIPLE_SELECT' && (
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={partialCredit}
                      onChange={(e) => setPartialCredit(e.target.checked)}
                    />
                    Aktifkan Skor Parsial (Partial Credit)
                  </label>
                )}
                {!options.some((o) => o.option_key === 'E') ? (
                  <button
                    type="button"
                    onClick={addOptionE}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Opsi E
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={removeOptionE}
                    className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    Hapus Opsi E
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {options.map((opt, idx) => (
                <div
                  key={opt.option_key}
                  className={`border rounded-xl p-4 space-y-3 ${
                    opt.is_correct ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type={questionType === 'MULTIPLE_CHOICE' ? 'radio' : 'checkbox'}
                        name="correct_option"
                        checked={Boolean(opt.is_correct)}
                        onChange={() => {
                          if (questionType === 'MULTIPLE_CHOICE') {
                            setOptions(
                              options.map((o, i) => ({ ...o, is_correct: i === idx }))
                            );
                          } else {
                            setOptions(
                              options.map((o, i) =>
                                i === idx ? { ...o, is_correct: !o.is_correct } : o
                              )
                            );
                          }
                        }}
                      />
                      <span className="font-display font-bold text-sm text-[#0F294A]">
                        Opsi {opt.option_key}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={opt.option_text}
                      onChange={(e) => {
                        const next = [...options];
                        next[idx] = { ...next[idx], option_text: e.target.value };
                        setOptions(next);
                      }}
                      placeholder={`Isi teks opsi ${opt.option_key} (opsional jika menggunakan gambar/audio)`}
                      className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                  </div>

                  <QuestionMediaBlock
                    label={`Media Opsi ${opt.option_key}`}
                    items={opt.media || []}
                    onChange={(nextMedia) => {
                      const next = [...options];
                      next[idx] = { ...next[idx], media: nextMedia };
                      setOptions(next);
                    }}
                    compact
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {questionType === 'TRUE_FALSE' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-3">
            <h3 className="font-display font-bold text-base text-slate-900">
              Kunci Jawaban Benar / Salah
            </h3>
            <div className="flex gap-4">
              {(['TRUE', 'FALSE'] as const).map((val) => (
                <label
                  key={val}
                  className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border cursor-pointer font-semibold text-sm ${
                    tfAnswer === val
                      ? 'border-[#0F294A] bg-blue-50 text-[#0F294A]'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="tf_key"
                    checked={tfAnswer === val}
                    onChange={() => setTfAnswer(val)}
                  />
                  {val === 'TRUE' ? 'BENAR (TRUE)' : 'SALAH (FALSE)'}
                </label>
              ))}
            </div>
          </div>
        )}

        {questionType === 'MATCHING' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">
                  Pasangan Menjodohkan (Kolom A ↔ Kolom B)
                </h3>
                <p className="text-xs text-slate-500">
                  Saat ujian berlangsung, urutan Kolom B akan diacak otomatis untuk setiap siswa.
                </p>
              </div>
              <button
                type="button"
                onClick={addMatchingPair}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Pasangan
              </button>
            </div>

            <div className="space-y-4">
              {matchingPairs.map((pair, idx) => (
                <div key={pair.pair_key} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0F294A]">
                      Pasangan #{pair.pair_key} ↔ {pair.right_key}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-slate-600 flex items-center gap-1.5">
                        Skor pasangan:
                        <input
                          type="number"
                          min={1}
                          step={0.5}
                          value={pair.score}
                          onChange={(e) => {
                            const next = [...matchingPairs];
                            next[idx] = { ...next[idx], score: Number(e.target.value) };
                            setMatchingPairs(next);
                          }}
                          className="w-16 px-2 py-1 text-xs font-mono-tabular border border-slate-300 rounded"
                        />
                      </label>
                      {matchingPairs.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeMatchingPair(idx)}
                          className="text-red-600 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <label className="block text-xs font-semibold text-slate-700">
                        Kolom A ({pair.pair_key})
                      </label>
                      <input
                        type="text"
                        value={pair.left_text}
                        onChange={(e) => {
                          const next = [...matchingPairs];
                          next[idx] = { ...next[idx], left_text: e.target.value };
                          setMatchingPairs(next);
                        }}
                        placeholder="Pernyataan / Pertanyaan Kolom A"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                      <QuestionMediaBlock
                        label={`Media Kolom A (${pair.pair_key})`}
                        items={pair.left_media || []}
                        onChange={(nextMedia) => {
                          const next = [...matchingPairs];
                          next[idx] = { ...next[idx], left_media: nextMedia };
                          setMatchingPairs(next);
                        }}
                        compact
                      />
                    </div>

                    <div className="space-y-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <label className="block text-xs font-semibold text-slate-700">
                        Kolom B ({pair.right_key}) — Pasangan Benar
                      </label>
                      <input
                        type="text"
                        value={pair.right_text}
                        onChange={(e) => {
                          const next = [...matchingPairs];
                          next[idx] = { ...next[idx], right_text: e.target.value };
                          setMatchingPairs(next);
                        }}
                        placeholder="Jawaban Pasangan Kolom B"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                      <QuestionMediaBlock
                        label={`Media Kolom B (${pair.right_key})`}
                        items={pair.right_media || []}
                        onChange={(nextMedia) => {
                          const next = [...matchingPairs];
                          next[idx] = { ...next[idx], right_media: nextMedia };
                          setMatchingPairs(next);
                        }}
                        compact
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/questions`)}
            className="px-5 py-2.5 text-sm font-semibold border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan Soal' : 'Simpan Soal ke Bank'}
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}
