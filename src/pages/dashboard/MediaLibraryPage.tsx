import React, { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, Music, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { AudioPlayer } from '../../components/AudioPlayer';
import { ConfirmModal } from '../../components/ConfirmModal';
import { MediaPickerModal } from '../../components/MediaPickerModal';
import { useToast } from '../../components/ToastProvider';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { apiRequest, getMediaFileUrl } from '../../services/api';
import type { MediaFile } from '../../types';

export function MediaLibraryPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IMAGE' | 'AUDIO'>('ALL');
  const [search, setSearch] = useState('');

  const [uploadType, setUploadType] = useState<'IMAGE' | 'AUDIO' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaFile | null>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (typeFilter !== 'ALL') q.set('type', typeFilter);
      if (search.trim()) q.set('search', search.trim());
      const res = await apiRequest<{ media: MediaFile[] }>(`/api/media?${q.toString()}`);
      setItems(res.media);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search, showToast]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/media/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('File media berhasil dihapus dari penyimpanan.', 'success');
      setDeleteTarget(null);
      void loadMedia();
    } catch (err) {
      showToast((err as Error).message, 'error');
      setDeleteTarget(null);
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>, targetItem: MediaFile) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiRequest(`/api/media/${targetItem.id}`, {
        method: 'PUT',
        body: fd,
      });
      showToast('File media berhasil diganti.', 'success');
      void loadMedia();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <DashboardLayout
      title="Media Library Terpusat"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUploadType('IMAGE')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Unggah Gambar
          </button>
          <button
            type="button"
            onClick={() => setUploadType('AUDIO')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F294A] hover:bg-[#1D4ED8] text-white"
          >
            <Music className="w-3.5 h-3.5" />
            Unggah Audio
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search & Type Segmented Filter */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'ALL', label: 'Semua Media' },
                { id: 'IMAGE', label: 'Gambar' },
                { id: 'AUDIO', label: 'Audio' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  typeFilter === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama file atau keterangan..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {/* Media Grid */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            Memuat Media Library...
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <Upload className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm text-slate-600">Belum ada file media tersimpan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
                <div>
                  {item.media_type === 'IMAGE' ? (
                    <img
                      src={getMediaFileUrl(item.id)}
                      alt={item.alt_text || item.original_name}
                      className="w-full h-44 object-contain bg-slate-50 rounded-lg border border-slate-100"
                    />
                  ) : (
                    <div className="py-2">
                      <AudioPlayer src={getMediaFileUrl(item.id)} title={item.original_name} />
                    </div>
                  )}

                  <div className="mt-3">
                    <h3 className="text-sm font-semibold text-slate-900 truncate" title={item.original_name}>
                      {item.original_name}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono-tabular">
                      <span>{item.media_type}</span>
                      <span aria-hidden="true">·</span>
                      <span>{(item.size_bytes / 1024).toFixed(1)} KB</span>
                      <span aria-hidden="true">·</span>
                      <span>Dipakai: {item.usage_count ?? 0} soal</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Diunggah: {new Date(item.created_at).toLocaleDateString('id-ID')} · {item.uploader_name || 'Sistem'}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] border border-blue-200 rounded-md hover:bg-blue-50 cursor-pointer">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Ganti File
                    <input
                      type="file"
                      className="hidden"
                      accept={item.media_type === 'IMAGE' ? '.jpg,.jpeg,.png,.webp' : '.mp3,.wav,.m4a,.ogg'}
                      onChange={(e) => void handleReplaceFile(e, item)}
                    />
                  </label>

                  <button
                    type="button"
                    disabled={(item.usage_count ?? 0) > 0}
                    onClick={() => setDeleteTarget(item)}
                    title={
                      (item.usage_count ?? 0) > 0
                        ? 'Tidak dapat dihapus karena masih dipakai di soal'
                        : 'Hapus media tidak terpakai'
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {uploadType && (
        <MediaPickerModal
          open={Boolean(uploadType)}
          mediaType={uploadType}
          onSelect={() => void loadMedia()}
          onClose={() => setUploadType(null)}
        />
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Media"
        message={`Hapus "${deleteTarget?.original_name}" secara permanen?`}
        confirmLabel="Hapus Permanen"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
