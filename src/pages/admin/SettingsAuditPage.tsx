import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useToast } from '../../components/ToastProvider';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest } from '../../services/api';

interface AuditLogRow {
  id: number;
  username: string;
  role: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details_json: string;
  created_at: string;
}

export function SettingsAuditPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiRequest<{ settings: Record<string, string> }>('/api/admin/settings'),
      apiRequest<{ logs: AuditLogRow[] }>('/api/admin/audit-logs?limit=100'),
    ]).then(([sRes, lRes]) => {
      setSettings(sRes.settings);
      setLogs(lRes.logs);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      showToast('Pengaturan sistem berhasil disimpan.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Pengaturan Sistem & Audit Log">
      <div className="space-y-6">
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="font-display font-bold text-base text-slate-900 border-b border-slate-100 pb-3">
            Konfigurasi Sistem Ujian
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Sekolah</label>
              <input
                type="text"
                value={settings.institution_name || ''}
                onChange={(e) => setSettings({ ...settings, institution_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Yayasan</label>
              <input
                type="text"
                value={settings.foundation_name || ''}
                onChange={(e) => setSettings({ ...settings, foundation_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun Pelajaran</label>
              <input
                type="text"
                value={settings.academic_year || ''}
                onChange={(e) => setSettings({ ...settings, academic_year: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batas Ukuran Gambar (MB)</label>
              <input
                type="number"
                min={1}
                max={25}
                value={settings.max_image_size_mb || '10'}
                onChange={(e) => setSettings({ ...settings, max_image_size_mb: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batas Ukuran Audio (MB)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={settings.max_audio_size_mb || '25'}
                onChange={(e) => setSettings({ ...settings, max_audio_size_mb: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-[#0F294A] hover:bg-[#1D4ED8] text-white rounded-lg"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>

        {/* Audit Logs */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 font-display font-bold text-base text-slate-900">
            Audit Log Keamanan & Aktivitas Terbaru
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Waktu</th>
                  <th className="py-2.5 px-4 font-semibold">Pengguna</th>
                  <th className="py-2.5 px-4 font-semibold">Aksi</th>
                  <th className="py-2.5 px-4 font-semibold">Sumber Daya</th>
                  <th className="py-2.5 px-4 font-semibold">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      {l.username || '—'} ({l.role || 'SYSTEM'})
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular text-[#0F294A]">{l.action}</td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {l.resource_type} {l.resource_id ? `#${l.resource_id}` : ''}
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-500 truncate max-w-xs">
                      {l.details_json}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
