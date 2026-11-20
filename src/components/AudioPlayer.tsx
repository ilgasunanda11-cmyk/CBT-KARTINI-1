import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  title?: string;
  maxReplays?: number | null;
  playCount?: number;
  onPlayTriggered?: () => void;
  compact?: boolean;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function AudioPlayer({
  src,
  title,
  maxReplays = null,
  playCount = 0,
  onPlayTriggered,
  compact = false,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);

  const replayLimitReached = maxReplays !== null && maxReplays > 0 && playCount >= maxReplays && !playing;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      setPlaying(false);
      setHasStartedOnce(false);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    if (replayLimitReached) return;

    if (!hasStartedOnce) {
      setHasStartedOnce(true);
      onPlayTriggered?.();
    }

    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const handleReplay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (maxReplays !== null && maxReplays > 0 && playCount >= maxReplays) return;

    audio.currentTime = 0;
    setCurrentTime(0);
    onPlayTriggered?.();
    try {
      await audio.play();
      setPlaying(true);
      setHasStartedOnce(true);
    } catch {
      setPlaying(false);
    }
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    setMuted(val === 0);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50 ${
        compact ? 'p-2.5' : 'p-3.5'
      }`}
    >
      {/* Never autoplay examination audio */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {title && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-slate-700 truncate">{title}</span>
          {maxReplays !== null && maxReplays > 0 && (
            <span className="text-[11px] font-mono-tabular text-slate-500 whitespace-nowrap shrink-0">
              Putar: {playCount}/{maxReplays}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          disabled={replayLimitReached}
          title={replayLimitReached ? 'Batas pemutaran audio tercapai' : playing ? 'Jeda' : 'Putar Audio'}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0F294A] text-white hover:bg-[#1D4ED8] transition-colors disabled:opacity-40 shrink-0"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={handleReplay}
          disabled={maxReplays !== null && maxReplays > 0 && playCount >= maxReplays}
          title="Putar Ulang dari Awal"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1 min-w-0">
          <div
            className="w-full h-2 bg-slate-200 rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (!audioRef.current || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              audioRef.current.currentTime = ratio * duration;
              setCurrentTime(ratio * duration);
            }}
          >
            <div
              className="h-full bg-[#1D4ED8] transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[11px] font-mono-tabular text-slate-500">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 text-slate-600 hover:text-slate-900"
            aria-label={muted ? 'Aktifkan suara' : 'Bisukan'}
          >
            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            aria-label="Volume Audio"
            className="w-16 accent-[#1D4ED8]"
          />
        </div>
      </div>

      {replayLimitReached && (
        <p className="mt-1.5 text-[11px] text-amber-700 font-medium">
          Batas pemutaran audio ({maxReplays} kali) telah tercapai.
        </p>
      )}
    </div>
  );
}
