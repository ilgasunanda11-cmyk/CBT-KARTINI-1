import React, { useEffect, useState } from 'react';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OfficialHeader } from '../../components/OfficialHeader';
import { useToast } from '../../components/ToastProvider';
import { apiRequest } from '../../services/api';
import type { SchoolClass, StudentExamQuestion, Subject } from '../../types';
import { AudioCheckStep } from './AudioCheckStep';
import { ExamInterface } from './ExamInterface';
import { ExamResultView } from './ExamResultView';

type FlowStep = 'identity' | 'audio-check' | 'exam' | 'result';

interface VerifiedPayload {
  resumed: boolean;
  session: {
    id: number;
    exam_id: number;
    student_name: string;
    participant_number: string;
    class_name: string;
    status: string;
  };
  exam: {
    id: number;
    title: string;
    subject_name: string;
    teacher_name: string;
    duration_minutes: number;
    instructions: string;
    allow_audio_replay: number;
    max_audio_replays: number;
    question_count: number;
  };
}

export function StudentExamFlow() {
  const { showToast } = useToast();
  const [step, setStep] = useState<FlowStep>('identity');

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Identity form fields
  const [fullName, setFullName] = useState('');
  const [classId, setClassId] = useState<number | ''>('');
  const [participantNumber, setParticipantNumber] = useState('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [examCode, setExamCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [verifiedData, setVerifiedData] = useState<VerifiedPayload | null>(null);
  const [starting, setStarting] = useState(false);
  const [activeExamData, setActiveExamData] = useState<{
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
    savedAnswers: Record<number, unknown>;
    audioPlayCounts: Record<number, number>;
  } | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<number | null>(null);

  useEffect(() => {
    apiRequest<{ classes: SchoolClass[]; subjects: Subject[] }>('/api/exams/public/options')
      .then((res) => {
        setClasses(res.classes);
        setSubjects(res.subjects);
        if (res.classes.length > 0) setClassId(res.classes[0].id);
        if (res.subjects.length > 0) setSubjectId(res.subjects[0].id);
      })
      .catch(() => {});
  }, []);

  const handleStartExam = async (target?: VerifiedPayload) => {
    const v = target ?? verifiedData;
    if (!v) return;
    setStarting(true);
    try {
      const res = await apiRequest<NonNullable<typeof activeExamData>>(
        `/api/exams/${v.exam.id}/start`,
        {
          method: 'POST',
          body: JSON.stringify({
            session_id: v.session.id,
            audio_checked: true,
            rules_confirmed: true,
          }),
        }
      );
      setActiveExamData(res);
      setStep('exam');
    } catch (err) {
      const msg = (err as Error).message;
      showToast(msg, 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const res = await apiRequest<VerifiedPayload>('/api/exams/verify-entry', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          class_id: Number(classId),
          participant_number: participantNumber,
          subject_id: Number(subjectId),
          exam_code: examCode,
        }),
      });
      setVerifiedData(res);
      if (res.resumed && res.session.status === 'IN_PROGRESS') {
        showToast('Melanjutkan sesi ujian Anda yang sedang berlangsung.', 'info');
        await handleStartExam(res);
      } else {
        setStep('audio-check');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setVerifying(false);
    }
  };

  if (step === 'audio-check' && verifiedData) {
    return (
      <AudioCheckStep
        exam={verifiedData.exam}
        student={verifiedData.session}
        starting={starting}
        onStartExam={() => void handleStartExam()}
        onBack={() => setStep('identity')}
      />
    );
  }

  if (step === 'exam' && activeExamData) {
    return (
      <ExamInterface
        session={activeExamData.session}
        exam={activeExamData.exam}
        questions={activeExamData.questions}
        initialAnswers={activeExamData.savedAnswers}
        initialAudioCounts={activeExamData.audioPlayCounts}
        onSubmitted={(sid) => {
          setCompletedSessionId(sid);
          setStep('result');
        }}
      />
    );
  }

  if (step === 'result' && completedSessionId) {
    return <ExamResultView sessionId={completedSessionId} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <OfficialHeader variant="auth" subtitle="Identitas Peserta Ujian (Tanpa Akun Login)" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-[#0F294A] text-white">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">
                Masuk Ruang Ujian Siswa
              </h2>
              <p className="text-xs text-slate-500">
                Isi data diri Anda sesuai kartu peserta ujian dan masukkan kode ujian dari pengawas.
              </p>
            </div>
          </div>

          <form onSubmit={handleVerifyIdentity} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap Siswa
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Masukkan nama lengkap Anda"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                <select
                  required
                  value={classId}
                  onChange={(e) => setClassId(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Peserta Ujian
                </label>
                <input
                  type="text"
                  required
                  value={participantNumber}
                  onChange={(e) => setParticipantNumber(e.target.value)}
                  placeholder="Contoh: KRT-2026-001"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mata Pelajaran
              </label>
              <select
                required
                value={subjectId}
                onChange={(e) => setSubjectId(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Ujian
              </label>
              <input
                type="text"
                required
                value={examCode}
                onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                placeholder="Masukkan kode ujian dari pengawas"
                className="w-full px-3.5 py-2.5 text-sm font-mono-tabular font-bold tracking-wider border border-slate-300 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={verifying}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {verifying ? 'Memverifikasi...' : 'Verifikasi & Lanjut ke Cek Audio'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500">
            <Link to="/" className="hover:text-slate-900">
              ← Kembali ke Beranda
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
