import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Maximize2,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { AudioPlayer } from '../../components/AudioPlayer';
import { ConfirmModal } from '../../components/ConfirmModal';
import { OfficialHeader } from '../../components/OfficialHeader';
import { useToast } from '../../components/ToastProvider';
import { apiRequest, getMediaFileUrl } from '../../services/api';
import type { AttachedMedia, StudentExamQuestion } from '../../types';

interface ExamInterfaceProps {
  session: {
    id: number;
    exam_id: number;
    student_name: string;
    participant_number: string;
    class_name: string;
    expires_at: string;
    remaining_seconds: number;
  };
  exam: {
    id: number;
    title: string;
    subject_name: string;
    allow_audio_replay: number;
    max_audio_replays: number;
  };
  questions: StudentExamQuestion[];
  initialAnswers: Record<number, unknown>;
  initialAudioCounts: Record<number, number>;
  onSubmitted: (sessionId: number) => void;
}

function formatTimer(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function playViolationAlarm() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    [880, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.16 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.16);
      osc.stop(ctx.currentTime + i * 0.16 + 0.15);
    });
  } catch {
    // ignore audio failure
  }
}

export function ExamInterface({
  session,
  exam,
  questions,
  initialAnswers,
  initialAudioCounts,
  onSubmitted,
}: ExamInterfaceProps) {
  const { showToast } = useToast();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, unknown>>(initialAnswers);
  const [audioCounts, setAudioCounts] = useState<Record<number, number>>(initialAudioCounts);
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [savingIndicator, setSavingIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Server-anchored timer using expires_at timestamp so refresh never resets it
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000))
  );
  const warnedMilestones = useRef<Set<number>>(new Set());
  const autoSubmittedRef = useRef(false);
  const essayDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Anti-cheating states
  const [violationAlert, setViolationAlert] = useState<{
    type: string;
    message: string;
    count: number;
  } | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const lastViolationTs = useRef(0);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentQuestion = questions[currentIdx];

  const submitExam = useCallback(
    async (isAuto: boolean) => {
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;
      setSubmitting(true);
      try {
        await apiRequest(`/api/exams/${exam.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({ session_id: session.id, is_auto: isAuto }),
        });
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        onSubmitted(session.id);
      } catch (err) {
        autoSubmittedRef.current = false;
        showToast((err as Error).message, 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [exam.id, session.id, onSubmitted, showToast]
  );

  // Countdown timer & 10m, 5m, 1m warnings & auto-submission
  useEffect(() => {
    const interval = setInterval(() => {
      const rem = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));
      setRemainingSeconds(rem);

      if (rem <= 600 && rem > 590 && !warnedMilestones.current.has(600)) {
        warnedMilestones.current.add(600);
        showToast('Peringatan Waktu: Sisa waktu ujian tinggal 10 menit.', 'info');
      } else if (rem <= 300 && rem > 290 && !warnedMilestones.current.has(300)) {
        warnedMilestones.current.add(300);
        showToast('Peringatan Waktu: Sisa waktu ujian tinggal 5 menit.', 'error');
      } else if (rem <= 60 && rem > 50 && !warnedMilestones.current.has(60)) {
        warnedMilestones.current.add(60);
        showToast('Perhatian! Sisa waktu ujian tinggal 1 menit lagi!', 'error');
      }

      if (rem <= 0 && !autoSubmittedRef.current) {
        clearInterval(interval);
        void submitExam(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session.expires_at, showToast, submitExam]);

  // WebSocket student heartbeat
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws?type=student&sessionId=${session.id}&examId=${exam.id}`
    );
    const hb = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const rem = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));
        ws.send(JSON.stringify({ type: 'heartbeat', remainingSeconds: rem }));
      }
    }, 10000);

    return () => {
      clearInterval(hb);
      ws.close();
    };
  }, [session.id, exam.id, session.expires_at]);

  // Anti-cheating monitoring (Visibility API, Fullscreen API, Page lifecycle)
  const triggerViolation = useCallback(
    async (
      vType: 'TAB_SWITCH' | 'EXIT_FULLSCREEN' | 'WINDOW_BLUR' | 'PAGE_HIDE',
      message: string
    ) => {
      if (autoSubmittedRef.current) return;
      const now = Date.now();
      if (now - lastViolationTs.current < 2500) return; // debounce overlapping blur/visibility events
      lastViolationTs.current = now;

      playViolationAlarm();
      try {
        const res = await apiRequest<{ violationCount: number }>('/api/monitoring/violation', {
          method: 'POST',
          body: JSON.stringify({
            session_id: session.id,
            exam_id: exam.id,
            violation_type: vType,
            details: message,
          }),
        });
        setViolationCount(res.violationCount);
        setViolationAlert({ type: vType, message, count: res.violationCount });
      } catch {
        setViolationAlert({ type: vType, message, count: violationCount + 1 });
      }
    },
    [session.id, exam.id, violationCount]
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        void triggerViolation('TAB_SWITCH', 'Anda terdeteksi meninggalkan tab atau menyembunyikan halaman ujian.');
      }
    };
    const onBlur = () => {
      void triggerViolation('WINDOW_BLUR', 'Fokus jendela ujian berpindah ke aplikasi atau jendela lain.');
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        void triggerViolation('EXIT_FULLSCREEN', 'Anda keluar dari mode layar penuh (Fullscreen) selama ujian berlangsung.');
      }
    };
    const onPageHide = () => {
      void triggerViolation('PAGE_HIDE', 'Halaman ujian terdeteksi tidak aktif atau ditinggalkan.');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [triggerViolation]);

  // Save answer to server
  const persistAnswer = useCallback(
    async (questionId: number, value: unknown, audioCountOverride?: number) => {
      setSavingIndicator('saving');
      try {
        await apiRequest(`/api/exams/${exam.id}/answers`, {
          method: 'POST',
          body: JSON.stringify({
            session_id: session.id,
            question_id: questionId,
            answer: value,
            audio_play_count: audioCountOverride ?? audioCounts[questionId] ?? 0,
          }),
        });
        setSavingIndicator('saved');
      } catch {
        setSavingIndicator('idle');
      }
    },
    [exam.id, session.id, audioCounts]
  );

  const handleAnswerChange = (questionId: number, value: unknown, debounce = false) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (debounce) {
      if (essayDebounceRef.current) clearTimeout(essayDebounceRef.current);
      essayDebounceRef.current = setTimeout(() => {
        void persistAnswer(questionId, value);
      }, 600);
    } else {
      void persistAnswer(questionId, value);
    }
  };

  const handleAudioPlay = (questionId: number) => {
    const nextCount = (audioCounts[questionId] || 0) + 1;
    setAudioCounts((prev) => ({ ...prev, [questionId]: nextCount }));
    void persistAnswer(questionId, answers[questionId] ?? null, nextCount);
  };

  const renderMediaList = (mediaList: AttachedMedia[], qId: number) => {
    if (!mediaList || mediaList.length === 0) return null;
    const maxReplays = exam.allow_audio_replay ? exam.max_audio_replays : 1;
    return (
      <div className="space-y-3 my-3">
        {mediaList.map((m, idx) =>
          m.media_type === 'IMAGE' ? (
            <figure key={`${m.media_id}_${idx}`} className="space-y-1">
              <img
                src={getMediaFileUrl(m.media_id)}
                alt={m.alt_text || m.caption || 'Gambar soal'}
                className="max-h-72 w-auto object-contain rounded-lg border border-slate-200 bg-slate-50"
              />
              {m.caption && <figcaption className="text-xs text-slate-500">{m.caption}</figcaption>}
            </figure>
          ) : (
            <div key={`${m.media_id}_${idx}`} className="max-w-lg">
              <AudioPlayer
                src={getMediaFileUrl(m.media_id)}
                title={m.caption || m.original_name || 'Audio Soal'}
                maxReplays={maxReplays > 0 ? maxReplays : null}
                playCount={audioCounts[qId] || 0}
                onPlayTriggered={() => handleAudioPlay(qId)}
              />
            </div>
          )
        )}
      </div>
    );
  };

  const isQuestionAnswered = (q: StudentExamQuestion) => {
    const v = answers[q.id];
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === 'object' && Object.keys(v as Record<string, unknown>).length === 0) return false;
    return true;
  };

  const answeredTotal = questions.filter(isQuestionAnswered).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 select-none">
      {/* Top Exam Bar with Official Dual Logos + Timer */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[260px] max-w-md">
            <OfficialHeader variant="compact" />
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <div className="hidden md:block text-right text-xs">
              <div className="font-bold text-slate-900">{session.student_name}</div>
              <div className="font-mono-tabular text-slate-500">
                {session.participant_number} · {session.class_name}
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border font-mono-tabular font-bold text-sm sm:text-base ${
                remainingSeconds <= 60
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : remainingSeconds <= 300
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-[#0F294A] border-[#0F294A] text-white'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>{formatTimer(remainingSeconds)}</span>
            </div>

            <button
              type="button"
              onClick={() => setSubmitConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Kirim Ujian
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Question Viewport */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 space-y-5">
          {currentQuestion ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs font-bold text-[#1D4ED8] uppercase tracking-wider">
                    Soal Nomor {currentIdx + 1} dari {questions.length}
                  </span>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {exam.title} · {exam.subject_name} · Bobot: {currentQuestion.score} poin
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500">
                    {savingIndicator === 'saving'
                      ? 'Menyimpan...'
                      : savingIndicator === 'saved'
                        ? 'Tersimpan otomatis'
                        : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFlagged((prev) => ({
                        ...prev,
                        [currentQuestion.id]: !prev[currentQuestion.id],
                      }))
                    }
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                      flagged[currentQuestion.id]
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {flagged[currentQuestion.id] ? 'Ditandai Ragu' : 'Tandai Ragu'}
                  </button>
                </div>
              </div>

              {/* Instructions + Instruction Media */}
              {(currentQuestion.instructions ||
                currentQuestion.media.some((m) => m.placement === 'INSTRUCTIONS')) && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  {currentQuestion.instructions && <p className="font-medium">{currentQuestion.instructions}</p>}
                  {renderMediaList(
                    currentQuestion.media.filter((m) => m.placement === 'INSTRUCTIONS'),
                    currentQuestion.id
                  )}
                </div>
              )}

              {/* Main Question Text & Media */}
              <div className="space-y-3">
                <p className="text-base sm:text-lg font-medium text-slate-900 leading-relaxed whitespace-pre-line">
                  {currentQuestion.question_text}
                </p>
                {renderMediaList(
                  currentQuestion.media.filter((m) => m.placement !== 'INSTRUCTIONS'),
                  currentQuestion.id
                )}
              </div>

              {/* 1. MULTIPLE CHOICE */}
              {currentQuestion.question_type === 'MULTIPLE_CHOICE' && (
                <div className="space-y-2.5 pt-2">
                  {currentQuestion.options.map((opt) => {
                    const selected = answers[currentQuestion.id] === opt.option_key;
                    return (
                      <label
                        key={opt.option_key}
                        className={`block p-4 rounded-xl border cursor-pointer transition-colors ${
                          selected
                            ? 'border-[#1D4ED8] bg-blue-50/50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name={`q_${currentQuestion.id}`}
                            checked={selected}
                            onChange={() => handleAnswerChange(currentQuestion.id, opt.option_key)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900">
                              <span className="font-display font-bold mr-2">{opt.option_key}.</span>
                              {opt.option_text}
                            </div>
                            {renderMediaList(opt.media, currentQuestion.id)}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* 2. MULTIPLE SELECT */}
              {currentQuestion.question_type === 'MULTIPLE_SELECT' && (
                <div className="space-y-2.5 pt-2">
                  <p className="text-xs font-semibold text-slate-500">
                    Pilih lebih dari satu jawaban yang sesuai:
                  </p>
                  {currentQuestion.options.map((opt) => {
                    const currentArr = Array.isArray(answers[currentQuestion.id])
                      ? (answers[currentQuestion.id] as string[])
                      : [];
                    const selected = currentArr.includes(opt.option_key);
                    return (
                      <label
                        key={opt.option_key}
                        className={`block p-4 rounded-xl border cursor-pointer transition-colors ${
                          selected
                            ? 'border-[#1D4ED8] bg-blue-50/50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              const next = selected
                                ? currentArr.filter((k) => k !== opt.option_key)
                                : [...currentArr, opt.option_key];
                              handleAnswerChange(currentQuestion.id, next);
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900">
                              <span className="font-display font-bold mr-2">{opt.option_key}.</span>
                              {opt.option_text}
                            </div>
                            {renderMediaList(opt.media, currentQuestion.id)}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* 3. TRUE / FALSE */}
              {currentQuestion.question_type === 'TRUE_FALSE' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {(['TRUE', 'FALSE'] as const).map((val) => {
                    const selected = answers[currentQuestion.id] === val;
                    return (
                      <label
                        key={val}
                        className={`flex items-center justify-center gap-3 p-5 rounded-xl border cursor-pointer font-display font-bold text-sm transition-colors ${
                          selected
                            ? 'border-[#1D4ED8] bg-blue-50 text-[#0F294A]'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQuestion.id}`}
                          checked={selected}
                          onChange={() => handleAnswerChange(currentQuestion.id, val)}
                        />
                        {val === 'TRUE' ? 'BENAR (TRUE)' : 'SALAH (FALSE)'}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* 4. MATCHING (Drag-and-Drop + Dropdown alternative + Images/Audio on both columns) */}
              {currentQuestion.question_type === 'MATCHING' && (
                <div className="space-y-4 pt-2">
                  <p className="text-xs text-slate-600">
                    Seret kartu jawaban dari <strong>Kolom B</strong> ke kotak di sebelah <strong>Kolom A</strong>, atau pilih langsung melalui dropdown.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* Column A + Drop/Select targets */}
                    <div className="md:col-span-7 space-y-3">
                      {currentQuestion.matching_left.map((leftItem) => {
                        const currentMap =
                          (answers[currentQuestion.id] as Record<string, string> | undefined) || {};
                        const chosenKey = currentMap[leftItem.pair_key] || '';
                        const chosenObj = currentQuestion.matching_right.find(
                          (r) => r.right_key === chosenKey
                        );

                        return (
                          <div
                            key={leftItem.pair_key}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const droppedKey = e.dataTransfer.getData('text/plain');
                              if (droppedKey) {
                                handleAnswerChange(currentQuestion.id, {
                                  ...currentMap,
                                  [leftItem.pair_key]: droppedKey,
                                });
                              }
                            }}
                            className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5"
                          >
                            <div className="text-sm font-semibold text-slate-900">
                              <span className="font-mono-tabular text-[#0F294A] mr-2">
                                {leftItem.pair_key}.
                              </span>
                              {leftItem.left_text}
                            </div>
                            {renderMediaList(leftItem.media, currentQuestion.id)}

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                              <div
                                className={`flex-1 px-3 py-2 rounded-lg border text-xs ${
                                  chosenObj
                                    ? 'border-[#1D4ED8] bg-blue-50 text-[#0F294A] font-semibold'
                                    : 'border-dashed border-slate-300 bg-white text-slate-400'
                                }`}
                              >
                                {chosenObj
                                  ? `Dipasangkan: ${chosenObj.right_key}. ${chosenObj.right_text}`
                                  : 'Seret pilihan Kolom B ke sini...'}
                              </div>
                              <select
                                value={chosenKey}
                                onChange={(e) =>
                                  handleAnswerChange(currentQuestion.id, {
                                    ...currentMap,
                                    [leftItem.pair_key]: e.target.value,
                                  })
                                }
                                aria-label={`Pilih pasangan untuk item ${leftItem.pair_key}`}
                                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                              >
                                <option value="">-- Pilih --</option>
                                {currentQuestion.matching_right.map((r) => (
                                  <option key={r.right_key} value={r.right_key}>
                                    {r.right_key}. {r.right_text || `Item ${r.right_key}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Column B Draggable Pool */}
                    <div className="md:col-span-5 space-y-2.5">
                      <div className="text-xs font-bold text-slate-700 px-1">
                        Pilihan Kolom B (Seret ke Kolom A)
                      </div>
                      {currentQuestion.matching_right.map((rightItem) => (
                        <div
                          key={rightItem.right_key}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', rightItem.right_key);
                          }}
                          className="p-3 rounded-xl border border-slate-300 bg-white hover:border-[#1D4ED8] cursor-grab active:cursor-grabbing space-y-2"
                        >
                          <div className="text-xs sm:text-sm font-medium text-slate-900">
                            <span className="font-display font-bold text-[#1D4ED8] mr-2">
                              {rightItem.right_key}.
                            </span>
                            {rightItem.right_text}
                          </div>
                          {renderMediaList(rightItem.media, currentQuestion.id)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 5. ESSAY */}
              {currentQuestion.question_type === 'ESSAY' && (
                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-semibold text-slate-600">
                    Tuliskan jawaban uraian Anda pada kotak di bawah ini (tersimpan otomatis):
                  </label>
                  <textarea
                    rows={7}
                    value={typeof answers[currentQuestion.id] === 'string' ? (answers[currentQuestion.id] as string) : ''}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value, true)}
                    placeholder="Ketik jawaban esai Anda di sini..."
                    className="w-full p-4 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] select-text"
                  />
                </div>
              )}

              {/* Prev / Next Navigation */}
              <div className="pt-5 mt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={currentIdx >= questions.length - 1}
                  onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg disabled:opacity-40"
                >
                  Berikutnya
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 py-10 text-center">
              Ujian ini belum memiliki soal.
            </p>
          )}
        </div>

        {/* Question Navigation Grid Sidebar */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-display font-bold text-sm text-slate-900">Navigasi Soal</h2>
            <span className="text-xs font-mono-tabular text-slate-600">
              {answeredTotal} / {questions.length} dijawab
            </span>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const isCurrent = idx === currentIdx;
              const isAnswered = isQuestionAnswered(q);
              const isFlagged = flagged[q.id];

              let cls = 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200';
              if (isFlagged) {
                cls = 'bg-amber-100 text-amber-900 border-amber-400';
              } else if (isAnswered) {
                cls = 'bg-emerald-600 text-white border-emerald-600';
              }
              if (isCurrent) {
                cls += ' ring-2 ring-[#1D4ED8] ring-offset-1';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={`h-10 rounded-lg border text-xs font-mono-tabular font-bold transition-colors ${cls}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-600">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />
              <span>Sudah dijawab</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-amber-200 border border-amber-400 inline-block" />
              <span>Ditandai ragu-ragu</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 inline-block" />
              <span>Belum dijawab</span>
            </div>
          </div>

          {violationCount > 0 && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
              Pelanggaran tercatat: {violationCount} kali
            </div>
          )}
        </aside>
      </main>

      {/* Anti-Cheating Violation Modal */}
      {violationAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/75 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border-2 border-red-500 max-w-md w-full p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h3 className="font-display font-extrabold text-lg text-red-700">
              Peringatan Pengawasan Ujian!
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">{violationAlert.message}</p>
            <p className="text-xs font-mono-tabular font-bold text-red-700">
              Pelanggaran ke-{violationAlert.count} telah dikirimkan ke pengawas ujian. Jawaban Anda tetap tersimpan dengan aman.
            </p>
            <button
              type="button"
              onClick={async () => {
                setViolationAlert(null);
                if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                  try {
                    await document.documentElement.requestFullscreen();
                  } catch {
                    // ignore
                  }
                }
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0F294A] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg"
            >
              <Maximize2 className="w-4 h-4" />
              Kembali ke Mode Layar Penuh & Lanjutkan Ujian
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={submitConfirmOpen}
        title="Selesaikan & Kirim Ujian?"
        message={`Anda telah menjawab ${answeredTotal} dari ${questions.length} soal. Setelah dikirim, jawaban tidak dapat diubah lagi.`}
        confirmLabel="Ya, Kirim Jawaban"
        loading={submitting}
        onConfirm={() => void submitExam(false)}
        onCancel={() => setSubmitConfirmOpen(false)}
      />
    </div>
  );
}
