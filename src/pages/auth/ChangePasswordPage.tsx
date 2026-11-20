import React, { useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { OfficialHeader } from '../../components/OfficialHeader';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../services/api';

function evaluatePasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: 'Belum diisi', color: 'bg-slate-200' };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 2) return { score: 1, label: 'Lemah', color: 'bg-red-500' };
  if (score === 3) return { score: 2, label: 'Cukup', color: 'bg-amber-500' };
  if (score === 4) return { score: 3, label: 'Kuat', color: 'bg-blue-600' };
  return { score: 4, label: 'Sangat Kuat', color: 'bg-emerald-600' };
}

export function ChangePasswordPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleHint = searchParams.get('role') === 'ADMIN' ? 'ADMIN' : 'TEACHER';

  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => evaluatePasswordStrength(newPassword), [newPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('Konfirmasi kata sandi baru tidak cocok.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          username: user ? user.username : username,
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      setSuccess(true);
      showToast('Kata sandi berhasil diperbarui.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const backPath = user
    ? user.role === 'ADMIN'
      ? '/admin/dashboard'
      : '/teacher/dashboard'
    : roleHint === 'ADMIN'
      ? '/admin/login'
      : '/teacher/login';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <OfficialHeader variant="auth" subtitle="Ubah Kata Sandi Akun" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-[#0F294A] text-white">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900">Ubah Kata Sandi</h2>
              <p className="text-xs text-slate-500">
                {user ? `Akun aktif: ${user.full_name} (@${user.username})` : 'Perbarui kata sandi Anda dengan aman.'}
              </p>
            </div>
          </div>

          {success ? (
            <div className="text-center py-4 space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="font-display font-bold text-base text-slate-900">
                Kata Sandi Berhasil Diperbarui
              </h3>
              <p className="text-xs text-slate-600">
                Kata sandi baru Anda sudah aktif dan tersimpan secara terenkripsi.
              </p>
              <button
                type="button"
                onClick={() => navigate(backPath)}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F294A] text-white font-semibold text-sm hover:bg-[#1D4ED8]"
              >
                Kembali
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!user && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Masukkan username akun Anda"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kata Sandi Saat Ini
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kata Sandi Baru
                </label>
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter (huruf dan angka)"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
                {/* Password Strength Indicator */}
                <div className="mt-2">
                  <div className="grid grid-cols-4 gap-1.5 h-1.5">
                    {[1, 2, 3, 4].map((lvl) => (
                      <div
                        key={lvl}
                        className={`rounded-full ${
                          strength.score >= lvl ? strength.color : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Kekuatan kata sandi: <span className="font-semibold">{strength.label}</span>
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}
              </button>
            </form>
          )}

          <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500">
            <Link to={backPath} className="hover:text-slate-900">
              ← Kembali
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
