import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Calendar, Clock, GraduationCap, Shield, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OfficialHeader } from '../../components/OfficialHeader';
import { apiRequest } from '../../services/api';

interface PublicExam {
  id: number;
  title: string;
  subject_name: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  question_count: number;
  teacher_name: string;
}

export function HomePage() {
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ exams: PublicExam[] }>('/api/exams/public/options')
      .then((res) => setExams(res.exams))
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Official School Identity Header */}
      <OfficialHeader variant="hero" />

      {/* Clean Top Navigation Bar (3-zone contract) */}
      <nav className="bg-[#0F294A] text-white border-b border-blue-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-12 flex items-center justify-between gap-8">
          <span className="text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap shrink-0">
            Portal Ujian Berbasis Komputer
          </span>
          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-blue-100">
            <a href="#jadwal-ujian" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Jadwal Ujian
            </a>
            <Link to="/exam" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Masuk Ruang Ujian
            </Link>
            <Link to="/teacher/login" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Login Guru
            </Link>
            <Link to="/admin/login" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Login Admin
            </Link>
          </div>
          <Link
            to="/exam"
            className="px-3.5 py-1.5 text-xs font-semibold bg-[#1D4ED8] hover:bg-blue-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            Mulai Ujian
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-10 space-y-12">
        {/* Hero Split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-[#1D4ED8] tracking-wide mb-3">
                Sistem Evaluasi Digital Resmi · Tahun Pelajaran 2026/2027
              </p>
              <h2 className="font-display font-extrabold text-2xl sm:text-4xl text-[#0F294A] leading-tight text-balance">
                Pelaksanaan Ujian Sekolah Terintegrasi, Aman, dan Terukur
              </h2>
              <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                Platform ujian resmi SMP Kartini 1 Batam di bawah naungan Yayasan Keluarga Batam.
                Siswa dapat mengikuti ujian langsung menggunakan nomor peserta dan kode ujian dari pengawas tanpa perlu membuat akun.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-4">
              <Link
                to="/exam"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                <GraduationCap className="w-4 h-4" />
                Masuk Ruang Ujian Siswa
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/teacher/login"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                Portal Guru
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 gap-4">
            <Link
              to="/exam"
              className="group bg-white border border-slate-200 hover:border-[#1D4ED8] rounded-xl p-5 transition-colors flex items-start gap-4"
            >
              <div className="p-3 rounded-lg bg-blue-50 text-[#1D4ED8] shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 group-hover:text-[#1D4ED8]">
                  Peserta Ujian (Siswa)
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Masuk langsung dengan identitas siswa, kelas, nomor peserta, dan kode ujian tanpa akun login.
                </p>
              </div>
            </Link>

            <Link
              to="/teacher/login"
              className="group bg-white border border-slate-200 hover:border-[#1D4ED8] rounded-xl p-5 transition-colors flex items-start gap-4"
            >
              <div className="p-3 rounded-lg bg-slate-100 text-[#0F294A] shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 group-hover:text-[#1D4ED8]">
                  Login Guru / Pengajar
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Kelola bank soal multimedia, impor Excel/CSV/Word, jadwal ujian, pantau siswa live, dan koreksi esai.
                </p>
              </div>
            </Link>

            <Link
              to="/admin/login"
              className="group bg-white border border-slate-200 hover:border-[#1D4ED8] rounded-xl p-5 transition-colors flex items-start gap-4"
            >
              <div className="p-3 rounded-lg bg-slate-100 text-[#0F294A] shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 group-hover:text-[#1D4ED8]">
                  Login Administrator
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Administrasi penuh sekolah: data siswa, guru, kelas, mata pelajaran, soal, ujian, dan audit log sistem.
                </p>
              </div>
            </Link>
          </div>
        </section>

        {/* Active / Published Schedule */}
        <section id="jadwal-ujian" className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="font-display font-bold text-lg sm:text-xl text-[#0F294A]">
                Daftar Ujian Terpublikasi
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Siapkan kode ujian dari pengawas sebelum masuk ke ruang ujian.
              </p>
            </div>
            <Link
              to="/exam"
              className="text-xs font-semibold text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0"
            >
              Buka Formulir Identitas Siswa →
            </Link>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Memuat jadwal ujian...</div>
          ) : exams.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Belum ada jadwal ujian yang dipublikasikan saat ini.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 mt-2">
              {exams.map((ex) => (
                <div
                  key={ex.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900">{ex.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        {ex.subject_name}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono-tabular">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {ex.exam_date}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono-tabular">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {ex.start_time} – {ex.end_time} ({ex.duration_minutes} menit)
                      </span>
                    </div>
                  </div>

                  <Link
                    to="/exam"
                    className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    Ikuti Ujian
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 py-5 px-4 sm:px-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} SMP Kartini 1 Batam — Yayasan Keluarga Batam · KARTINI CBT 4.0
      </footer>
    </div>
  );
}
