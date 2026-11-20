import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';
import type { SchoolClass, Subject } from '../../types';

export function ClassManagementPage() {
  const { showToast } = useToast();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState(7);
  const [academicYear, setAcademicYear] = useState('2026/2027');

  const load = useCallback(async () => {
    const res = await apiRequest<{ classes: SchoolClass[] }>('/api/admin/classes');
    setClasses(res.classes);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/classes', {
        method: 'POST',
        body: JSON.stringify({ name, grade_level: gradeLevel, academic_year: academicYear }),
      });
      setName('');
      showToast('Kelas berhasil ditambahkan.', 'success');
      void load();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/admin/classes/${id}`, { method: 'DELETE' });
      showToast('Kelas dihapus.', 'success');
      void load();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <DashboardLayout title="Manajemen Kelas">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleAdd} className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
          <h3 className="font-display font-bold text-base text-slate-900">Tambah Kelas Baru</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Kelas</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: IX-C"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat</label>
            <select
              value={gradeLevel}
              onChange={(e) => setGradeLevel(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value={7}>Kelas VII</option>
              <option value={8}>Kelas VIII</option>
              <option value={9}>Kelas IX</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun Pelajaran</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Simpan Kelas
          </button>
        </form>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold">Nama Kelas</th>
                <th className="py-3 px-4 font-semibold">Tingkat</th>
                <th className="py-3 px-4 font-semibold">Tahun Pelajaran</th>
                <th className="py-3 px-4 font-semibold">Jumlah Siswa</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {classes.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 px-4 font-semibold text-slate-900">{c.name}</td>
                  <td className="py-3 px-4 font-mono-tabular text-slate-700">Kelas {c.grade_level}</td>
                  <td className="py-3 px-4 font-mono-tabular text-slate-600">{c.academic_year}</td>
                  <td className="py-3 px-4 font-mono-tabular text-slate-700">{c.student_count ?? 0}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(c.id)}
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
      </div>
    </DashboardLayout>
  );
}

export function SubjectManagementPage() {
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    const res = await apiRequest<{ subjects: Subject[] }>('/api/admin/subjects');
    setSubjects(res.subjects);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/subjects', {
        method: 'POST',
        body: JSON.stringify({ code, name, description }),
      });
      setCode('');
      setName('');
      setDescription('');
      showToast('Mata pelajaran berhasil ditambahkan.', 'success');
      void load();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/admin/subjects/${id}`, { method: 'DELETE' });
      showToast('Mata pelajaran dihapus.', 'success');
      void load();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <DashboardLayout title="Manajemen Mata Pelajaran">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleAdd} className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
          <h3 className="font-display font-bold text-base text-slate-900">Tambah Mata Pelajaran</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Mapel</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Contoh: TIK"
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Mata Pelajaran</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Informatika"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan (Opsional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Simpan Mata Pelajaran
          </button>
        </form>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold">Kode</th>
                <th className="py-3 px-4 font-semibold">Mata Pelajaran</th>
                <th className="py-3 px-4 font-semibold">Jumlah Soal</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 px-4 font-mono-tabular font-bold text-[#0F294A]">{s.code}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{s.name}</div>
                    {s.description && <div className="text-[11px] text-slate-500">{s.description}</div>}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-slate-700">{s.question_count ?? 0}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(s.id)}
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
      </div>
    </DashboardLayout>
  );
}
