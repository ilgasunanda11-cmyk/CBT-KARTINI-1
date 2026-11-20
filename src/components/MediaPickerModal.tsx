import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Music, Search, Upload, X } from 'lucide-react';
import { apiRequest, getMediaFileUrl } from '../services/api';
import type { MediaFile } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { useToast } from './ToastProvider';

interface MediaPickerModalProps {
  open: boolean;
  mediaType: 'IMAGE' | 'AUDIO';
  title?: string;
  onSelect: (media: MediaFile, meta?: { caption: string; altText: string }) => void;
  onClose: () => void;
}

export function MediaPickerModal({
  open,
  mediaType,
  title,
  onSelect,
  onClose,
}: MediaPickerModalProps) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'upload' | 'library'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);

  const [libraryItems, setLibraryItems] = useState<MediaFile[]>([]);
  const [loadingLib, setLoadingLib] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setCaption('');
    setAltText('');
    if (tab === 'library') {
      void loadLibrary();
    }
  }, [open, tab, mediaType]);

  const loadLibrary = async () => {
    setLoadingLib(true);
    try {
      const q = new URLSearchParams({ type: mediaType });
      if (search.trim()) q.set('search', search.trim());
      const res = await apiRequest<{ media: MediaFile[] }>(`/api/media?${q.toString()}`);
      setLibraryItems(res.media);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setLoadingLib(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      showToast('Pilih file terlebih dahulu.', 'error');
      return;
    }

    setUploading(true);
    try {
      let durationSeconds = 0;
      if (mediaType === 'AUDIO') {
        durationSeconds = await new Promise<number>((resolve) => {
          const url = URL.createObjectURL(file);
          const aud = new Audio(url);
          aud.addEventListener('loadedmetadata', () => {
            const d = Number.isFinite(aud.duration) ? aud.duration : 0;
            URL.revokeObjectURL(url);
            resolve(d);
          });
          aud.addEventListener('error', () => {
            URL.revokeObjectURL(url);
            resolve(0);
          });
        });
      }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', caption);
      fd.append('alt_text', altText);
      fd.append('duration_seconds', String(durationSeconds));

      const res = await apiRequest<{ media: MediaFile }>('/api/media/upload', {
        method: 'POST',
        body: fd,
      });

      showToast(
        `${mediaType === 'IMAGE' ? 'Gambar' : 'Audio'} berhasil diunggah ke penyimpanan permanen.`,
        'success'
      );
      onSelect(res.media, { caption, altText });
      onClose();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  const acceptExt =
    mediaType === 'IMAGE' ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' : '.mp3,.wav,.m4a,.ogg,audio/*';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            {mediaType === 'IMAGE' ? (
              <ImageIcon className="w-5 h-5 text-[#1D4ED8]" />
            ) : (
              <Music className="w-5 h-5 text-[#1D4ED8]" />
            )}
            <h3 className="font-display font-bold text-base text-slate-900">
              {title || (mediaType === 'IMAGE' ? 'Tambah Gambar' : 'Tambah Audio')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tab === 'upload' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unggah File Baru
            </button>
            <button
              type="button"
              onClick={() => setTab('library')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tab === 'library' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pilih dari Media Library
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {tab === 'upload' ? (
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50/70">
                <Upload className="w-8 h-8 text-[#1D4ED8] mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-800">
                  {mediaType === 'IMAGE'
                    ? 'Pilih gambar (JPG, JPEG, PNG, WEBP — maks. 10 MB)'
                    : 'Pilih audio (MP3, WAV, M4A, OGG — maks. 25 MB)'}
                </p>
                <input
                  type="file"
                  accept={acceptExt}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="mt-3 block w-full text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#0F294A] file:text-white hover:file:bg-[#1D4ED8] cursor-pointer"
                />
                {file && (
                  <p className="mt-2 text-xs text-slate-600 font-mono-tabular">
                    Dipilih: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Keterangan / Caption (Opsional)
                  </label>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Contoh: Diagram sel tumbuhan"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
                {mediaType === 'IMAGE' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Teks Alternatif / Alt Text (Aksesibilitas)
                    </label>
                    <input
                      type="text"
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                      placeholder="Deskripsi singkat isi gambar"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#0F294A] rounded-lg hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {uploading ? 'Mengunggah...' : 'Unggah & Gunakan'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama file atau caption..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void loadLibrary()}
                  className="px-4 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                >
                  Cari
                </button>
              </div>

              {loadingLib ? (
                <p className="text-sm text-slate-500 py-8 text-center">Memuat Media Library...</p>
              ) : libraryItems.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  Belum ada file {mediaType === 'IMAGE' ? 'gambar' : 'audio'} di Media Library.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {libraryItems.map((item) => (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-lg p-3 flex flex-col justify-between gap-2.5 bg-white hover:border-[#1D4ED8] transition-colors"
                    >
                      {item.media_type === 'IMAGE' ? (
                        <img
                          src={getMediaFileUrl(item.id)}
                          alt={item.alt_text || item.original_name}
                          className="w-full h-32 object-contain bg-slate-50 rounded"
                        />
                      ) : (
                        <AudioPlayer src={getMediaFileUrl(item.id)} title={item.original_name} compact />
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{item.original_name}</p>
                          <p className="text-[11px] text-slate-500 font-mono-tabular">
                            {(item.size_bytes / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(item, { caption: item.caption || '', altText: item.alt_text || '' });
                            onClose();
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-[#0F294A] text-white rounded-md hover:bg-[#1D4ED8] whitespace-nowrap shrink-0"
                        >
                          Pilih
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
