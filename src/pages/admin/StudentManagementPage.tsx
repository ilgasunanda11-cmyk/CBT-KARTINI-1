import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useToast } from '../../components/ToastProvider';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type { SchoolClass, StudentRecord } from '../../types';

export function StudentManagementPage() {
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRecord | null>(null);
  const [participantNumber, setParticipantNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [classId, setClassId] = useState<number | ''>('');
  const [gender, setGender] = useState('L');
  const [deleteTarget, setDeleteTarget] = useState<StudentRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (classFilter) q.set('classId', classFilter);
      if (search.trim()) q.set('search', search.trim());
      const [sRes, cRes] = await Promise.all([
        apiRequest<{ students: StudentRecord[] }>(`/api/admin/students?${q.toString()}`),
        apiRequest<{ classes: SchoolClass[] }>('/api/admin/reference/classes'),
      ]);
      setStudents(sRes.students);
      setClasses(cRes.classes);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [classFilter, search, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setParticipantNumber('');
    setFullName('');
    setClassId(classes[0]?.id || '');
    setGender('L');
    setModalOpen(true);
  };

  const openEdit = (st: StudentRecord) => {
    setEditing(st);
    setParticipantNumber(st.participant_number);
    setFullName(st.full_name);
    setClassId(st.class_id);
    setGender(st.gender);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        participant_number: participantNumber,
        full_name: fullName,
        class_id: Number(classId),
        gender,
      };
      if (editing) {
        await apiRequest(`/api/admin/students/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Data siswa berhasil diperbarui.', 'success');
      } else {
        await apiRequest('/api/admin/students', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Siswa baru berhasil ditambahkan.', 'success');
      }
      setModalOpen(false);
      void loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/admin/students/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('Data siswa berhasil dihapus.', 'success');
      setDeleteTarget(null);
      void loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <DashboardLayout
      title="Manajemen Peserta Ujian (Siswa)"
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Siswa
        </button>
      }
    >
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau nomor peserta..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Semua Kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat data siswa...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Nomor Peserta</th>
                    <th className="py-3 px-4 font-semibold">Nama Lengkap</th>
                    <th className="py-3 px-4 font-semibold">Kelas</th>
                    <th className="py-3 px-4 font-semibold">L/P</th>
                    <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-[#0F294A]">
                        {st.participant_number}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{st.full_name}</td>
                      <td className="py-3 px-4 text-slate-700">{st.class_name}</td>
                      <td className="py-3 px-4 text-slate-600">{st.gender}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(st)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-[#1D4ED8] hover:bg-blue-50 rounded-md mr-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(st)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md"
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
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900">
              {editing ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Peserta Ujian</label>
              <input
                type="text"
                required
                value={participantNumber}
                onChange={(e) => setParticipantNumber(e.target.value)}
                placeholder="Contoh: KRT-2026-005"
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
              />
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                <select
                  required
                  value={classId}
                  onChange={(e) => setClassId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-[#0F294A] text-white rounded-lg"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Siswa"
        message={`Hapus peserta "${deleteTarget?.full_name}"?`}
        confirmLabel="Hapus"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
