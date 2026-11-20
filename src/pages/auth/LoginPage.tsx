import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { OfficialHeader } from '../../components/OfficialHeader';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/api';
import type { User } from '../../types';

interface LoginPageProps {
  role: 'ADMIN' | 'TEACHER';
}

export function LoginPage({ role }: LoginPageProps) {
  const { needsInitialSetup, refreshAuth, setUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // First-time Admin setup state (used ONLY when no admin exists yet)
  const [setupFullName, setSetupFullName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');

  const isAdmin = role === 'ADMIN';
  const showInitialSetup = isAdmin && needsInitialSetup;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const endpoint = isAdmin ? '/api/auth/admin/login' : '/api/auth/teacher/login';
      const res = await apiRequest<{ user: User }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setUser(res.user);
      await refreshAuth();
      showToast(`Selamat datang, ${res.user.full_name}`, 'success');
      navigate(isAdmin ? '/admin/dashboard' : '/teacher/dashboard');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== setupConfirmPassword) {
      showToast('Konfirmasi kata sandi tidak cocok.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/admin/setup', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          full_name: setupFullName,
          email: setupEmail,
        }),
      });
      setUser(res.user);
      await refreshAuth();
      showToast('Akun Administrator utama berhasil dibuat.', 'success');
      navigate('/admin/dashboard');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <OfficialHeader
        variant="auth"
        subtitle={
          showInitialSetup
            ? 'Konfigurasi Administrator Pertama Kali'
            : isAdmin
              ? 'Portal Login Administrator Sistem'
              : 'Portal Login Guru & Pengajar'
        }
      />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-[#0F294A] text-white shrink-0">
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">
                {showInitialSetup
                  ? 'Buat Akun Administrator'
                  : isAdmin
                    ? 'Login Administrator'
                    : 'Login Guru / Pengajar'}
              </h2>
              <p className="text-xs text-slate-500">
                {showInitialSetup
                  ? 'Belum ada akun Administrator terdaftar. Buat akun utama terlebih dahulu.'
                  : 'Masukkan kredensial resmi Anda untuk mengakses sistem.'}
              </p>
            </div>
          </div>

          <form onSubmit={showInitialSetup ? handleInitialSetup : handleLogin} className="space-y-4">
            {showInitialSetup && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap Administrator
                  </label>
                  <input
                    type="text"
                    required
                    value={setupFullName}
                    onChange={(e) => setSetupFullName(e.target.value)}
                    placeholder="Contoh: Operator CBT SMP Kartini 1"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email (Opsional)
                  </label>
                  <input
                    type="email"
                    value={setupEmail}
                    onChange={(e) => setSetupEmail(e.target.value)}
                    placeholder="admin@smpkartini1batam.sch.id"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isAdmin ? 'Masukkan username admin' : 'Masukkan username guru'}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={showInitialSetup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter (huruf & angka)"
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {showInitialSetup && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Konfirmasi Kata Sandi
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={setupConfirmPassword}
                  onChange={(e) => setSetupConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              {submitting
                ? 'Memproses...'
                : showInitialSetup
                  ? 'Simpan & Masuk sebagai Administrator'
                  : 'Masuk'}
            </button>
          </form>

          {!showInitialSetup && (
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link
                to={`/change-password?role=${role}`}
                className="text-slate-600 hover:text-[#1D4ED8] inline-flex items-center gap-1 font-medium"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Ubah Kata Sandi
              </Link>
              <Link
                to={`/forgot-password?role=${role}`}
                className="text-[#1D4ED8] hover:underline font-medium"
              >
                Lupa Kata Sandi?
              </Link>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <Link to="/" className="hover:text-slate-800">
              ← Beranda
            </Link>
            <Link
              to={isAdmin ? '/teacher/login' : '/admin/login'}
              className="hover:text-[#1D4ED8] font-medium"
            >
              {isAdmin ? 'Beralih ke Login Guru →' : 'Beralih ke Login Admin →'}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
