import React, { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  BookOpen,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  GraduationCap,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type { Exam } from '../../types';

interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalSubjects: number;
  totalQuestions: number;
  totalExams: number;
  activeSessions: number;
  pendingEssayCount: number;
}

export function DashboardHome() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const basePath = isAdmin ? '/admin' : '/teacher';

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentExams, setRecentExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ stats: DashboardStats; recentExams: Exam[] }>('/api/admin/dashboard-stats')
      .then((res) => {
        setStats(res.stats);
        setRecentExams(res.recentExams);
      })
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Total Soal Tersedia', value: stats?.totalQuestions ?? 0, icon: Database, to: `${basePath}/questions` },
    { label: 'Total Ujian', value: stats?.totalExams ?? 0, icon: ClipboardCheck, to: `${basePath}/exams` },
    { label: 'Peserta Sedang Ujian', value: stats?.activeSessions ?? 0, icon: Activity, to: `${basePath}/monitoring` },
    { label: 'Antrean Koreksi Esai', value: stats?.pendingEssayCount ?? 0, icon: BookOpen, to: `${basePath}/essay-grading` },
    ...(isAdmin
      ? [
          { label: 'Siswa Terdaftar', value: stats?.totalStudents ?? 0, icon: GraduationCap, to: '/admin/students' },
          { label: 'Akun Guru', value: stats?.totalTeachers ?? 0, icon: Users, to: '/admin/users' },
        ]
      : []),
  ];

  return (
    <DashboardLayout
      title={isAdmin ? 'Dashboard Administrator' : 'Dashboard Guru'}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to={`${basePath}/questions/new`}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white transition-colors whitespace-nowrap shrink-0"
          >
            + Buat Soal Baru
          </Link>
          <Link
            to={`${basePath}/import`}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            Impor Soal
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Summary KPI Cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}>
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.label}
                to={c.to}
                className="bg-white border border-slate-200 hover:border-[#1D4ED8] rounded-xl p-5 transition-colors flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-xs font-medium text-slate-500">{c.label}</p>
                  <p className="mt-1.5 text-2xl font-display font-bold text-[#0F294A] font-mono-tabular">
                    {loading ? '—' : c.value}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-[#1D4ED8]">
                  <Icon className="w-5 h-5" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Actions Grid */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-display font-bold text-base text-slate-900 mb-4">
            Akses Cepat Modul Utama
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              to={`${basePath}/questions`}
              className="p-3.5 rounded-lg border border-slate-200 hover:border-[#1D4ED8] hover:bg-blue-50/30 transition-colors"
            >
              <Database className="w-5 h-5 text-[#1D4ED8] mb-2" />
              <div className="text-xs font-bold text-slate-900">Bank Soal</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Kelola 5 tipe soal + media</div>
            </Link>
            <Link
              to={`${basePath}/import`}
              className="p-3.5 rounded-lg border border-slate-200 hover:border-[#1D4ED8] hover:bg-blue-50/30 transition-colors"
            >
              <FileSpreadsheet className="w-5 h-5 text-[#1D4ED8] mb-2" />
              <div className="text-xs font-bold text-slate-900">Pusat Impor</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Excel, CSV, Word & ZIP Audio</div>
            </Link>
            <Link
              to={`${basePath}/monitoring`}
              className="p-3.5 rounded-lg border border-slate-200 hover:border-[#1D4ED8] hover:bg-blue-50/30 transition-colors"
            >
              <Activity className="w-5 h-5 text-[#1D4ED8] mb-2" />
              <div className="text-xs font-bold text-slate-900">Monitoring Live</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Pantau progres & pelanggaran</div>
            </Link>
            <Link
              to={`${basePath}/results`}
              className="p-3.5 rounded-lg border border-slate-200 hover:border-[#1D4ED8] hover:bg-blue-50/30 transition-colors"
            >
              <Award className="w-5 h-5 text-[#1D4ED8] mb-2" />
              <div className="text-xs font-bold text-slate-900">Hasil & Ekspor</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Peringkat, Excel, CSV, Cetak</div>
            </Link>
          </div>
        </div>

        {/* Recent Examinations Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-slate-900">Ujian Terbaru</h2>
            <Link to={`${basePath}/exams`} className="text-xs font-semibold text-[#1D4ED8] hover:underline">
              Lihat Semua →
            </Link>
          </div>
          {recentExams.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada ujian dibuat. Klik &quot;Manajemen Ujian&quot; untuk menjadwalkan ujian baru.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Judul Ujian</th>
                    <th className="py-2.5 px-4 font-semibold">Mata Pelajaran</th>
                    <th className="py-2.5 px-4 font-semibold">Kode</th>
                    <th className="py-2.5 px-4 font-semibold">Jadwal</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentExams.map((ex) => (
                    <tr key={ex.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-semibold text-slate-900">{ex.title}</td>
                      <td className="py-3 px-4 text-slate-600">{ex.subject_name}</td>
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-[#0F294A]">
                        {ex.exam_code}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-600">
                        {ex.exam_date} · {ex.start_time}–{ex.end_time}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
