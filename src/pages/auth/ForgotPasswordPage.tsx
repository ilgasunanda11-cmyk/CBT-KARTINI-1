import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { OfficialHeader } from '../../components/OfficialHeader';
import { useToast } from '../../components/ToastProvider';
import { apiRequest } from '../../services/api';

export function ForgotPasswordPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleHint = searchParams.get('role') === 'ADMIN' ? 'ADMIN' : 'TEACHER';

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [username, setUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ username, role: roleHint }),
      });
      setInfoMessage(res.message);
      setStep('reset');
      showToast('Permintaan reset kata sandi telah dicatat.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('Konfirmasi kata sandi tidak cocok.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ username, resetToken, newPassword, confirmPassword }),
      });
      showToast('Kata sandi berhasil direset. Silakan login kembali.', 'success');
      navigate(roleHint === 'ADMIN' ? '/admin/login' : '/teacher/login');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <OfficialHeader variant="auth" subtitle="Pemulihan & Reset Kata Sandi" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-[#0F294A] text-white">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">Lupa Kata Sandi</h2>
              <p className="text-xs text-slate-500">
                Ajukan permintaan reset atau masukkan token reset dari Administrator.
              </p>
            </div>
          </div>

          <div className="flex gap-2 mb-5 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setStep('request')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                step === 'request' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              1. Ajukan Reset
            </button>
            <button
              type="button"
              onClick={() => setStep('reset')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                step === 'reset' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              2. Masukkan Token Reset
            </button>
          </div>

          {infoMessage && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed">
              {infoMessage}
            </div>
          )}

          {step === 'request' ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Username Akun</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username Anda"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white font-semibold text-sm"
              >
                {submitting ? 'Memproses...' : 'Catat Permintaan Reset'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Token Reset dari Administrator
                </label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value.toUpperCase())}
                  placeholder="Contoh: A1B2C3D4"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi Baru</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter (huruf & angka)"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white font-semibold text-sm"
              >
                {submitting ? 'Memproses...' : 'Reset Kata Sandi'}
              </button>
            </form>
          )}

          <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500">
            <Link to={roleHint === 'ADMIN' ? '/admin/login' : '/teacher/login'} className="hover:text-slate-900">
              ← Kembali ke Login
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
