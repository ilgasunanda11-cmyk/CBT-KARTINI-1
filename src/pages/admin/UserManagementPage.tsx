import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useToast } from '../../components/ToastProvider';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type { User } from '../../types';

export function UserManagementPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'TEACHER' | 'ADMIN'>('TEACHER');
  const [nip, setNip] = useState('');

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ users: User[] }>('/api/admin/users');
      setUsers(res.users);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          full_name: fullName,
          email,
          role,
          nip,
        }),
      });
      showToast('Akun pengguna berhasil dibuat.', 'success');
      setCreateOpen(false);
      setUsername('');
      setPassword('');
      setFullName('');
      setEmail('');
      setNip('');
      void loadUsers();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await apiRequest(`/api/admin/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: u.is_active === 1 ? 0 : 1 }),
      });
      showToast(`Status akun ${u.username} diperbarui.`, 'success');
      void loadUsers();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleResetPassword = async (mode: 'direct' | 'token') => {
    if (!resetTarget) return;
    try {
      const res = await apiRequest<{ resetToken?: string; message?: string }>(
        `/api/admin/users/${resetTarget.id}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify(mode === 'direct' ? { newPassword: newResetPassword } : {}),
        }
      );
      if (res.resetToken) {
        setGeneratedToken(res.resetToken);
        showToast('Token reset satu kali berhasil dibuat.', 'success');
      } else {
        showToast(res.message || 'Kata sandi berhasil direset.', 'success');
        setResetTarget(null);
        setNewResetPassword('');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Akun berhasil dihapus.', 'success');
      setDeleteTarget(null);
      void loadUsers();
    } catch (err) {
      showToast((err as Error).message, 'error');
      setDeleteTarget(null);
    }
  };

  return (
    <DashboardLayout
      title="Manajemen Guru & Akun Sistem"
      actions={
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Akun Guru / Admin
        </button>
      }
    >
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Memuat daftar akun...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Nama Lengkap</th>
                  <th className="py-3 px-4 font-semibold">Username</th>
                  <th className="py-3 px-4 font-semibold">Peran</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{u.full_name}</div>
                      {u.email && <div className="text-[11px] text-slate-500">{u.email}</div>}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700">@{u.username}</td>
                    <td className="py-3 px-4 font-semibold text-[#0F294A]">{u.role}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-semibold ${u.is_active === 1 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {u.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        onClick={() => {
                          setResetTarget(u);
                          setGeneratedToken(null);
                          setNewResetPassword('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#1D4ED8] hover:bg-blue-50 rounded-md"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Reset Sandi
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActive(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md"
                      >
                        {u.is_active === 1 ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        {u.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900">Buat Akun Baru</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Peran</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'TEACHER' | 'ADMIN')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="TEACHER">Guru / Pengajar</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi Awal</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email (Opsional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            {role === 'TEACHER' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">NIP / NIY (Opsional)</label>
                <input
                  type="text"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0F294A] text-white rounded-lg">
                Simpan Akun
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900">
              Reset Kata Sandi: {resetTarget.full_name}
            </h3>

            {generatedToken ? (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-center space-y-2">
                <p className="text-xs text-emerald-800">
                  Berikan token satu kali berikut kepada guru untuk mereset kata sandi melalui halaman Lupa Kata Sandi:
                </p>
                <p className="text-xl font-mono-tabular font-bold text-[#0F294A] tracking-widest">
                  {generatedToken}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Opsi 1: Atur Kata Sandi Baru Secara Langsung
                  </label>
                  <input
                    type="password"
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={newResetPassword.length < 8}
                    onClick={() => void handleResetPassword('direct')}
                    className="w-full py-2 text-xs font-semibold bg-[#0F294A] text-white rounded-lg disabled:opacity-50"
                  >
                    Terapkan Kata Sandi Baru
                  </button>
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <p className="text-xs text-slate-600">
                    Opsi 2: Terbitkan Token Reset Satu Kali (Guru membuat kata sandi baru sendiri)
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleResetPassword('token')}
                    className="w-full py-2 text-xs font-semibold border border-[#1D4ED8] text-[#1D4ED8] rounded-lg hover:bg-blue-50"
                  >
                    Terbitkan Token Reset
                  </button>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Akun"
        message={`Hapus akun "${deleteTarget?.full_name}" (@${deleteTarget?.username})?`}
        confirmLabel="Hapus"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
