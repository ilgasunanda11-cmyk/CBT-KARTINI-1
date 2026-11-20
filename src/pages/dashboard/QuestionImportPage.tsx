import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Music,
  Upload,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest, getMediaFileUrl } from '../../services/api';
import type { ParsedImportQuestion, QuestionBank, SchoolClass, Subject } from '../../types';

interface ImportSummary {
  totalParsed: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  duplicateCount: number;
  extractedImages: number;
  mappedAudio: number;
}

export function QuestionImportPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const basePath = user?.role === 'ADMIN' ? '/admin' : '/teacher';

  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [sourceFormat, setSourceFormat] = useState<'excel' | 'csv' | 'word'>('excel');
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [extraMediaFiles, setExtraMediaFiles] = useState<FileList | null>(null);

  const [targetBankId, setTargetBankId] = useState<number | ''>('');
  const [targetSubjectId, setTargetSubjectId] = useState<number | ''>('');
  const [targetClassId, setTargetClassId] = useState<number | ''>('');

  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);

  const [previewQuestions, setPreviewQuestions] = useState<ParsedImportQuestion[] | null>(null);
  const [extractedMedia, setExtractedMedia] = useState<
    Array<{ mediaId: number; originalName: string; mediaType: 'IMAGE' | 'AUDIO' }>
  >([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      apiRequest<{ banks: QuestionBank[] }>('/api/questions/banks'),
      apiRequest<{ subjects: Subject[] }>('/api/admin/reference/subjects'),
      apiRequest<{ classes: SchoolClass[] }>('/api/admin/reference/classes'),
    ]).then(([bRes, sRes, cRes]) => {
      setBanks(bRes.banks);
      setSubjects(sRes.subjects);
      setClasses(cRes.classes);
      if (bRes.banks.length > 0) {
        setTargetBankId(bRes.banks[0].id);
        setTargetSubjectId(bRes.banks[0].subject_id);
      } else if (sRes.subjects.length > 0) {
        setTargetSubjectId(sRes.subjects[0].id);
      }
    });
  }, []);

  const handleParseUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainFile) {
      showToast('Pilih file soal terlebih dahulu.', 'error');
      return;
    }

    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', mainFile);
      if (extraMediaFiles) {
        for (let i = 0; i < extraMediaFiles.length; i++) {
          fd.append('mediaFiles', extraMediaFiles[i]);
        }
      }

      const res = await apiRequest<{
        questions: ParsedImportQuestion[];
        extractedMedia: Array<{ mediaId: number; originalName: string; mediaType: 'IMAGE' | 'AUDIO' }>;
        summary: ImportSummary;
        globalErrors: string[];
      }>(`/api/import/${sourceFormat}`, {
        method: 'POST',
        body: fd,
      });

      setPreviewQuestions(res.questions);
      setExtractedMedia(res.extractedMedia || []);
      setSummary(res.summary);
      setGlobalErrors(res.globalErrors || []);
      showToast(`Berhasil membaca ${res.questions.length} soal untuk pratinjau.`, 'info');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setParsing(false);
    }
  };

  const handleUpdateQuestionField = (idx: number, patch: Partial<ParsedImportQuestion>) => {
    if (!previewQuestions) return;
    const next = [...previewQuestions];
    next[idx] = { ...next[idx], ...patch };
    setPreviewQuestions(next);
  };

  const handleRevalidate = async () => {
    if (!previewQuestions) return;
    try {
      const res = await apiRequest<{
        questions: ParsedImportQuestion[];
        summary: Omit<ImportSummary, 'extractedImages' | 'mappedAudio'>;
      }>('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          questions: previewQuestions,
          subjectId: targetSubjectId || undefined,
        }),
      });
      setPreviewQuestions(res.questions);
      setSummary((prev) => ({
        ...res.summary,
        extractedImages: prev?.extractedImages ?? 0,
        mappedAudio: prev?.mappedAudio ?? 0,
      }));
      showToast('Validasi ulang selesai.', 'info');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleConfirmImport = async () => {
    if (!previewQuestions || !targetBankId || !targetSubjectId) {
      showToast('Pilih Bank Soal dan Mata Pelajaran tujuan.', 'error');
      return;
    }

    setCommitting(true);
    try {
      const res = await apiRequest<{ importedCount: number }>('/api/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          bankId: Number(targetBankId),
          subjectId: Number(targetSubjectId),
          classId: targetClassId ? Number(targetClassId) : null,
          questions: previewQuestions,
          skipInvalid,
        }),
      });
      showToast(`${res.importedCount} soal berhasil diimpor ke Bank Soal.`, 'success');
      navigate(`${basePath}/questions`);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setCommitting(false);
    }
  };

  const handleCancelImport = () => {
    setPreviewQuestions(null);
    setExtractedMedia([]);
    setSummary(null);
    setGlobalErrors([]);
    setMainFile(null);
    setExtraMediaFiles(null);
  };

  return (
    <DashboardLayout title="Pusat Impor Soal (Excel, CSV, Word & ZIP Audio)">
      <div className="space-y-6">
        {/* Format Selector + Templates */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'excel', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
                  { id: 'csv', label: 'CSV (.csv)', icon: FileText },
                  { id: 'word', label: 'Word (.docx / .zip)', icon: FileText },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setSourceFormat(tab.id);
                      setMainFile(null);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      sourceFormat === tab.id
                        ? 'bg-white text-[#0F294A] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/import/template/${sourceFormat === 'excel' ? 'xlsx' : sourceFormat === 'csv' ? 'csv' : 'docx'}`}
                download
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh Template Resmi ({sourceFormat.toUpperCase()})
              </a>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
            {sourceFormat === 'word' ? (
              <>
                <p className="font-semibold text-[#0F294A]">Panduan Impor Word (.docx) & Paket Audio (.zip):</p>
                <p>
                  Gunakan penanda <code>QUESTION 1</code>, <code>TYPE: MULTIPLE CHOICE / MULTIPLE SELECT / TRUE FALSE / MATCHING / ESSAY</code>, dan <code>SCORE: 10</code>.
                  Gambar yang disematkan di dalam dokumen Word diekstrak otomatis dan dipetakan ke soal terkait.
                </p>
                <p>
                  Untuk soal audio, Anda dapat mengunggah paket <strong>.zip</strong> berisi file <code>.docx</code> + file audio bernama <code>QUESTION_001.mp3</code> atau <code>OPTION_001_A.mp3</code>, atau mengunggah file audio secara terpisah di bawah.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-[#0F294A]">Panduan Impor {sourceFormat.toUpperCase()}:</p>
                <p>
                  Kolom yang didukung: <code>Number</code>, <code>Subject</code>, <code>Class</code>, <code>Question Type</code>, <code>Question</code>, <code>Option A..E</code>, <code>Correct Answer</code>, <code>Score</code>, <code>Question Image</code>, <code>Question Audio</code>, <code>Option Image</code>, <code>Option Audio</code>, dan <code>Matching Pairs</code>.
                </p>
                <p>
                  Unggah file gambar/audio pendukung di kolom file media tambahan di bawah jika file belum ada di Media Library.
                </p>
              </>
            )}
          </div>

          {!previewQuestions && (
            <form onSubmit={handleParseUpload} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 bg-slate-50/50">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    1. File Soal Utama ({sourceFormat === 'excel' ? '.xlsx' : sourceFormat === 'csv' ? '.csv' : '.docx / .zip'})
                  </label>
                  <input
                    type="file"
                    required
                    accept={
                      sourceFormat === 'excel'
                        ? '.xlsx,.xls'
                        : sourceFormat === 'csv'
                          ? '.csv'
                          : '.docx,.zip'
                    }
                    onChange={(e) => setMainFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#0F294A] file:text-white cursor-pointer"
                  />
                </div>

                <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 bg-slate-50/50">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    2. File Audio / Gambar Tambahan (Opsional, Multi-file)
                  </label>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.ogg"
                    onChange={(e) => setExtraMediaFiles(e.target.files)}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-white cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={parsing || !mainFile}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {parsing ? 'Memproses & Memvalidasi...' : 'Unggah & Pratinjau Soal'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Preview & Validation Workspace */}
        {previewQuestions && (
          <div className="space-y-4">
            {/* Summary & Target Selection */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900">
                    Pratinjau & Validasi Hasil Impor
                  </h2>
                  {summary && (
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-mono-tabular">
                      <span className="text-slate-700">Total: {summary.totalParsed}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 font-semibold">Valid: {summary.validCount}</span>
                      <span aria-hidden="true">·</span>
                      <span className={summary.errorCount > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                        Error: {summary.errorCount}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-700">Duplikat/Peringatan: {summary.warningCount}</span>
                      {extractedMedia.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#1D4ED8]">Media terekstrak: {extractedMedia.length}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRevalidate()}
                    className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Validasi Ulang
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelImport}
                    className="px-3.5 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    Batalkan Impor
                  </button>
                </div>
              </div>

              {globalErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                  {globalErrors.map((ge, i) => (
                    <p key={i}>{ge}</p>
                  ))}
                </div>
              )}

              {extractedMedia.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-700 mb-2">
                    Pratinjau Media Terekstrak / Terpetakan:
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {extractedMedia.map((em) => (
                      <div key={em.mediaId} className="border border-slate-200 bg-white rounded-lg p-2 text-xs">
                        {em.mediaType === 'IMAGE' ? (
                          <img
                            src={getMediaFileUrl(em.mediaId)}
                            alt={em.originalName}
                            className="h-16 w-auto object-contain rounded mb-1"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 text-[#1D4ED8] mb-1">
                            <Music className="w-4 h-4" />
                            <span>Audio</span>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-600 truncate max-w-[140px]">{em.originalName}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Destination Bank / Subject / Class */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Soal Tujuan</label>
                  <select
                    value={targetBankId}
                    onChange={(e) => setTargetBankId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
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
                    value={targetSubjectId}
                    onChange={(e) => setTargetSubjectId(Number(e.target.value))}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas (Opsional)</label>
                  <select
                    value={targetClassId}
                    onChange={(e) => setTargetClassId(e.target.value ? Number(e.target.value) : '')}
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
              </div>
            </div>

            {/* Editable Preview Rows */}
            <div className="space-y-3">
              {previewQuestions.map((q, idx) => {
                const hasError = q.errors.length > 0;
                return (
                  <div
                    key={q.tempId}
                    className={`bg-white border rounded-xl p-4 space-y-3 ${
                      hasError ? 'border-red-300' : q.warnings.length > 0 ? 'border-amber-300' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <span className="font-mono-tabular text-[#0F294A]">Soal #{q.number}</span>
                        <span aria-hidden="true">·</span>
                        <span>{q.questionType}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">Skor: {q.defaultScore}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        {hasError ? (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <AlertCircle className="w-4 h-4" />
                            {q.errors.length} Kesalahan
                          </span>
                        ) : q.warnings.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="w-4 h-4" />
                            Peringatan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />
                            Siap Diimpor
                          </span>
                        )}
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={q.questionText}
                      onChange={(e) => handleUpdateQuestionField(idx, { questionText: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />

                    {q.mediaRefs.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-xs text-[#1D4ED8]">
                        {q.mediaRefs.map((mr, mIdx) => (
                          <span key={mIdx} className="bg-blue-50 px-2 py-1 rounded border border-blue-200">
                            {mr.mediaType}: {mr.originalName}
                          </span>
                        ))}
                      </div>
                    )}

                    {q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {q.options.map((o) => (
                          <div
                            key={o.optionKey}
                            className={`p-2 rounded border ${
                              o.isCorrect ? 'border-emerald-300 bg-emerald-50/50 font-semibold' : 'border-slate-200'
                            }`}
                          >
                            {o.optionKey}. {o.optionText}
                          </div>
                        ))}
                      </div>
                    )}

                    {q.matchingPairs.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {q.matchingPairs.map((p) => (
                          <div key={p.pairKey} className="p-2 rounded border border-slate-200">
                            {p.pairKey}. {p.leftText} ↔ {p.rightKey}. {p.rightText}
                          </div>
                        ))}
                      </div>
                    )}

                    {(q.errors.length > 0 || q.warnings.length > 0) && (
                      <div className="text-xs space-y-1 pt-1">
                        {q.errors.map((err, eIdx) => (
                          <p key={eIdx} className="text-red-600 font-medium">
                            Error: {err}
                          </p>
                        ))}
                        {q.warnings.map((w, wIdx) => (
                          <p key={wIdx} className="text-amber-700">
                            Peringatan: {w}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Commit Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={skipInvalid}
                  onChange={(e) => setSkipInvalid(e.target.checked)}
                />
                Lewati soal yang masih memiliki error validasi (impor soal yang valid saja)
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancelImport}
                  className="px-4 py-2 text-sm font-semibold border border-slate-300 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={committing}
                  onClick={() => void handleConfirmImport()}
                  className="px-5 py-2 text-sm font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg disabled:opacity-50"
                >
                  {committing ? 'Menyimpan...' : 'Konfirmasi & Simpan ke Bank Soal'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
