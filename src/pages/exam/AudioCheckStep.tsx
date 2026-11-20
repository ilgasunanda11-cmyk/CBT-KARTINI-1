import React, { useEffect, useState } from 'react';
import { CheckCircle2, Maximize2, Play, ShieldAlert, Volume2, Wifi } from 'lucide-react';
import { OfficialHeader } from '../../components/OfficialHeader';

interface AudioCheckStepProps {
  exam: {
    id: number;
    title: string;
    subject_name: string;
    teacher_name: string;
    duration_minutes: number;
    instructions: string;
    question_count: number;
  };
  student: {
    student_name: string;
    participant_number: string;
    class_name: string;
  };
  starting: boolean;
  onStartExam: () => void;
  onBack: () => void;
}

export function AudioCheckStep({
  exam,
  student,
  starting,
  onStartExam,
  onBack,
}: AudioCheckStepProps) {
  const [onlineOk, setOnlineOk] = useState(navigator.onLine);
  const [browserOk, setBrowserOk] = useState(false);
  const [fullscreenOk, setFullscreenOk] = useState(Boolean(document.fullscreenElement));
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [audioConfirmed, setAudioConfirmed] = useState(false);
  const [rulesConfirmed, setRulesConfirmed] = useState(false);

  useEffect(() => {
    const hasAudio = typeof window.Audio !== 'undefined';
    const hasStorage = typeof window.localStorage !== 'undefined';
    setBrowserOk(hasAudio && hasStorage);

    const onOnline = () => setOnlineOk(true);
    const onOffline = () => setOnlineOk(false);
    const onFsChange = () => setFullscreenOk(Boolean(document.fullscreenElement));

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('fullscreenchange', onFsChange);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []);

  const playTestChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + idx * 0.18 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.18 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.18);
        osc.stop(ctx.currentTime + idx * 0.18 + 0.36);
      });
      setAudioPlayed(true);
    } catch {
      setAudioPlayed(true);
    }
  };

  const requestFullscreenMode = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setFullscreenOk(true);
      }
    } catch {
      // Allow fallback if iframe sandbox blocks fullscreen
      setFullscreenOk(true);
    }
  };

  const handleProceed = async () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Proceed even if browser blocks programmatic fullscreen
      }
    }
    onStartExam();
  };

  const canStart = onlineOk && browserOk && audioConfirmed && rulesConfirmed;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <OfficialHeader variant="auth" subtitle="Pemeriksaan Perangkat, Audio & Tata Tertib Ujian" />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-6">
        {/* Student & Exam Info Summary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">Nama Peserta</span>
            <strong className="text-sm text-slate-900">{student.student_name}</strong>
            <span className="block font-mono-tabular text-slate-600 mt-0.5">
              {student.participant_number} · {student.class_name}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Mata Pelajaran & Ujian</span>
            <strong className="text-sm text-[#0F294A]">{exam.title}</strong>
            <span className="block text-slate-600 mt-0.5">{exam.subject_name}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Durasi & Pengajar</span>
            <strong className="text-sm font-mono-tabular text-slate-900">
              {exam.duration_minutes} Menit
            </strong>
            <span className="block text-slate-600 mt-0.5">{exam.teacher_name}</span>
          </div>
        </div>

        {/* Mandatory Volume Warning Banner */}
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 flex items-start gap-4">
          <Volume2 className="w-7 h-7 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <h2 className="font-display font-extrabold text-base sm:text-lg text-amber-950">
              PASTIKAN VOLUME KOMPUTER ATAU LAPTOP ANDA 100% SEBELUM UJIAN DIMULAI.
            </h2>
            <p className="text-xs text-amber-900 leading-relaxed">
              Browser tidak dapat mengubah volume sistem operasi secara otomatis. Pastikan volume perangkat Anda sudah dinaikkan maksimal ke 100% dan tekan tombol uji audio di bawah ini.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={playTestChime}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                Putar Suara Uji Coba Audio
              </button>
              {audioPlayed && (
                <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Nada uji telah diputar
                </span>
              )}
            </div>
          </div>
        </div>

        {/* System Readiness Checks */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <h3 className="font-display font-bold text-base text-slate-900">
            Pemeriksaan Sistem & Layar Penuh
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-[#1D4ED8]" />
                <span className="font-semibold text-slate-800">Koneksi Internet</span>
              </div>
              <span className={onlineOk ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                {onlineOk ? 'Terhubung' : 'Terputus'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1D4ED8]" />
                <span className="font-semibold text-slate-800">Kompatibilitas Browser</span>
              </div>
              <span className={browserOk ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                {browserOk ? 'Siap' : 'Tidak Didukung'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-[#1D4ED8]" />
                <span className="font-semibold text-slate-800">Mode Layar Penuh</span>
              </div>
              {fullscreenOk ? (
                <span className="text-emerald-700 font-bold">Aktif</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void requestFullscreenMode()}
                  className="text-[#1D4ED8] font-bold hover:underline"
                >
                  Aktifkan
                </button>
              )}
            </div>
          </div>

          {/* Exam Instructions & Anti-Cheating Rules */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0F294A]">
              <ShieldAlert className="w-4 h-4 text-[#1D4ED8]" />
              Petunjuk & Tata Tertib Ujian
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5 leading-relaxed">
              {exam.instructions && <p className="font-medium text-slate-900">{exam.instructions}</p>}
              <p>1. Ujian berjalan dalam mode layar penuh (Fullscreen). Dilarang keluar dari layar penuh selama ujian berlangsung.</p>
              <p>2. Dilarang berpindah tab browser, membuka aplikasi lain, atau meminimalkan jendela ujian.</p>
              <p>3. Setiap pelanggaran akan memicu alarm peringatan dan tercatat secara otomatis untuk pengawas ujian.</p>
              <p>4. Jawaban tersimpan otomatis ke server dan ujian akan dikirimkan otomatis saat waktu habis.</p>
            </div>
          </div>

          {/* Mandatory Confirmations */}
          <div className="space-y-2.5 pt-2">
            <label className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={audioConfirmed}
                onChange={(e) => setAudioConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>
                Saya memastikan volume perangkat sudah 100% dan saya dapat mendengar suara uji coba audio dengan jelas.
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={rulesConfirmed}
                onChange={(e) => setRulesConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>
                Saya telah membaca dan bersedia mematuhi seluruh tata tertib serta pengawasan anti-kecurangan selama ujian berlangsung.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              ← Kembali ke Identitas
            </button>
            <button
              type="button"
              disabled={!canStart || starting}
              onClick={() => void handleProceed()}
              className="px-6 py-3 text-sm font-bold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg transition-colors disabled:opacity-40"
            >
              {starting ? 'Mempersiapkan Soal...' : 'Mulai Ujian Sekarang'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
