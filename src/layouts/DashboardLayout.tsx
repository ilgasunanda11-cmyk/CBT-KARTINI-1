import React, { useState } from 'react';
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  FolderOpen,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  School,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { OfficialHeader } from '../components/OfficialHeader';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export function DashboardLayout({
  children,
  title,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const basePath = isAdmin ? '/admin' : '/teacher';

  const navItems: NavItem[] = [
    { label: 'Dashboard', to: `${basePath}/dashboard`, icon: LayoutDashboard },
    { label: 'Bank Soal', to: `${basePath}/questions`, icon: Database },
    { label: 'Impor Soal', to: `${basePath}/import`, icon: FileSpreadsheet },
    { label: 'Media Library', to: `${basePath}/media`, icon: FolderOpen },
    { label: 'Manajemen Ujian', to: `${basePath}/exams`, icon: ClipboardCheck },
    { label: 'Monitoring Live', to: `${basePath}/monitoring`, icon: Activity },
    { label: 'Koreksi Esai', to: `${basePath}/essay-grading`, icon: BookOpen },
    { label: 'Hasil & Laporan', to: `${basePath}/results`, icon: Award },
    ...(isAdmin
      ? [
          { label: 'Siswa', to: '/admin/students', icon: GraduationCap, adminOnly: true },
          { label: 'Guru & Akun', to: '/admin/users', icon: Users, adminOnly: true },
          { label: 'Kelas', to: '/admin/classes', icon: School, adminOnly: true },
          { label: 'Mata Pelajaran', to: '/admin/subjects', icon: BookOpen, adminOnly: true },
          { label: 'Pengaturan & Log', to: '/admin/settings', icon: Settings, adminOnly: true },
        ]
      : []),
  ];

  const handleLogout = async () => {
    await logout();
    navigate(isAdmin ? '/admin/login' : '/teacher/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Official Institutional Header with both logos */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-6 py-2.5 no-print">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Toggle Menu"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/assets/logos/logo-ykb.png"
                alt="Logo Yayasan Keluarga Batam"
                className="h-9 sm:h-10 w-auto object-contain shrink-0"
              />
              <div className="hidden sm:block min-w-0">
                <div className="font-display font-bold text-sm text-[#0F294A] leading-tight truncate">
                  KARTINI CBT 4.0
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  SMP Kartini 1 Batam · Yayasan Keluarga Batam
                </div>
              </div>
              <img
                src="/assets/logos/logo-smp-kartini.png"
                alt="Logo SMP Kartini 1 Batam"
                className="h-9 sm:h-10 w-auto object-contain shrink-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setProfileMenuOpen(false);
                }}
                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Notifikasi"
              >
                <Bell className="w-4 h-4" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-40">
                  <div className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100">
                    Pusat Informasi Sistem
                  </div>
                  <div className="py-2 space-y-2 text-xs text-slate-600">
                    <p>
                      Peran aktif: <span className="font-semibold text-[#0F294A]">{user?.role}</span>
                    </p>
                    <Link
                      to={`${basePath}/monitoring`}
                      onClick={() => setNotifOpen(false)}
                      className="block text-[#1D4ED8] hover:underline font-medium"
                    >
                      Buka Monitoring Ujian Real-Time →
                    </Link>
                    <Link
                      to={`${basePath}/essay-grading`}
                      onClick={() => setNotifOpen(false)}
                      className="block text-[#1D4ED8] hover:underline font-medium"
                    >
                      Periksa Antrean Koreksi Esai →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(!profileMenuOpen);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-md bg-[#0F294A] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {user?.full_name?.slice(0, 2).toUpperCase() || 'USR'}
                </div>
                <div className="hidden md:block min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate max-w-[140px]">
                    {user?.full_name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAdmin ? 'Administrator' : 'Guru / Pengajar'}
                  </div>
                </div>
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900 truncate">{user?.full_name}</p>
                    <p className="text-[11px] text-slate-500 truncate">@{user?.username}</p>
                  </div>
                  <Link
                    to="/change-password"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Ubah Kata Sandi
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-xs text-red-600 hover:bg-red-50 text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Keluar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-y-0 left-0 z-20 w-64 bg-[#0F294A] text-white pt-16 lg:pt-4 pb-6 px-3 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="px-3 py-2 mb-2 flex items-center gap-2 text-xs font-semibold text-blue-200 border-b border-white/10">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{isAdmin ? 'Portal Administrator' : 'Portal Guru'}</span>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#1D4ED8] text-white'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="pt-4 mt-4 border-t border-white/10 px-2">
            <Link
              to="/"
              className="block text-center py-2 px-3 rounded-lg text-xs font-medium text-blue-100 hover:bg-white/10 transition-colors"
            >
              Lihat Beranda Publik
            </Link>
          </div>
        </aside>

        {/* Backdrop for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-10 bg-slate-900/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {/* Printable-only official header */}
            <div className="hidden print:block">
              <OfficialHeader variant="print" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 no-print">
              <h1 className="font-display font-bold text-xl sm:text-2xl text-slate-900 tracking-tight">
                {title}
              </h1>
              {actions && <div className="flex items-center gap-2.5">{actions}</div>}
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
