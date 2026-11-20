import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Image as ImageIcon, Music, RefreshCw, Trash2 } from 'lucide-react';
import { getMediaFileUrl } from '../services/api';
import type { AttachedMedia, MediaFile } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { MediaPickerModal } from './MediaPickerModal';

interface QuestionMediaBlockProps {
  label: string;
  items: AttachedMedia[];
  onChange: (next: AttachedMedia[]) => void;
  compact?: boolean;
}

export function QuestionMediaBlock({ label, items, onChange, compact = false }: QuestionMediaBlockProps) {
  const [pickerType, setPickerType] = useState<'IMAGE' | 'AUDIO' | null>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

  const handleSelect = (media: MediaFile, meta?: { caption: string; altText: string }) => {
    const newItem: AttachedMedia = {
      media_id: media.id,
      media_type: media.media_type,
      original_name: media.original_name,
      mime_type: media.mime_type,
      duration_seconds: media.duration_seconds,
      caption: meta?.caption || media.caption || '',
      alt_text: meta?.altText || media.alt_text || '',
      sort_order: items.length,
    };

    if (replaceIndex !== null) {
      const next = [...items];
      next[replaceIndex] = { ...newItem, sort_order: replaceIndex };
      onChange(next);
      setReplaceIndex(null);
    } else {
      onChange([...items, newItem]);
    }
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    onChange(next.map((m, i) => ({ ...m, sort_order: i })));
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx).map((m, i) => ({ ...m, sort_order: i })));
  };

  const updateMeta = (idx: number, field: 'caption' | 'alt_text', val: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setReplaceIndex(null);
              setPickerType('IMAGE');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 hover:border-[#1D4ED8] hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            ADD IMAGE
          </button>
          <button
            type="button"
            onClick={() => {
              setReplaceIndex(null);
              setPickerType('AUDIO');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 hover:border-[#1D4ED8] hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0"
          >
            <Music className="w-3.5 h-3.5" />
            ADD AUDIO
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className={`grid gap-2.5 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {items.map((item, idx) => (
            <div
              key={`${item.media_id}_${idx}`}
              className="border border-slate-200 rounded-lg p-2.5 bg-white space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 truncate">
                  {item.media_type === 'IMAGE' ? 'Gambar' : 'Audio'}: {item.original_name || `#${item.media_id}`}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0}
                    title="Geser Naik"
                    className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(idx, 1)}
                    disabled={idx === items.length - 1}
                    title="Geser Turun"
                    className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceIndex(idx);
                      setPickerType(item.media_type);
                    }}
                    title="Ganti Media"
                    className="p-1 text-slate-500 hover:text-[#1D4ED8]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    title="Hapus Media"
                    className="p-1 text-slate-500 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {item.media_type === 'IMAGE' ? (
                <img
                  src={getMediaFileUrl(item.media_id)}
                  alt={item.alt_text || item.original_name || 'Media soal'}
                  className="w-full max-h-40 object-contain rounded bg-slate-50 border border-slate-100"
                />
              ) : (
                <AudioPlayer src={getMediaFileUrl(item.media_id)} compact />
              )}

              {!compact && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={item.caption || ''}
                    onChange={(e) => updateMeta(idx, 'caption', e.target.value)}
                    placeholder="Caption media"
                    className="px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]"
                  />
                  {item.media_type === 'IMAGE' && (
                    <input
                      type="text"
                      value={item.alt_text || ''}
                      onChange={(e) => updateMeta(idx, 'alt_text', e.target.value)}
                      placeholder="Alt text gambar"
                      className="px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]"
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pickerType && (
        <MediaPickerModal
          open={Boolean(pickerType)}
          mediaType={pickerType}
          title={
            replaceIndex !== null
              ? `Ganti ${pickerType === 'IMAGE' ? 'Gambar' : 'Audio'}`
              : `${label} — ${pickerType === 'IMAGE' ? 'Tambah Gambar' : 'Tambah Audio'}`
          }
          onSelect={handleSelect}
          onClose={() => {
            setPickerType(null);
            setReplaceIndex(null);
          }}
        />
      )}
    </div>
  );
}
