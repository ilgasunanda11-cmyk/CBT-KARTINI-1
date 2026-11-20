import React from 'react';

interface OfficialHeaderProps {
  variant?: 'hero' | 'auth' | 'compact' | 'print';
  subtitle?: string;
}

export function OfficialHeader({ variant = 'hero', subtitle }: OfficialHeaderProps) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/assets/logos/logo-ykb.png"
            alt="Logo Yayasan Keluarga Batam"
            className="h-10 w-auto object-contain shrink-0"
          />
          <div className="min-w-0">
            <div className="font-display font-bold text-sm sm:text-base text-[#0F294A] tracking-tight truncate">
              KARTINI CBT 4.0
            </div>
            <div className="text-[11px] text-slate-600 truncate">
              SMP Kartini 1 Batam · Yayasan Keluarga Batam
            </div>
          </div>
        </div>
        <img
          src="/assets/logos/logo-smp-kartini.png"
          alt="Logo SMP Kartini 1 Batam"
          className="h-10 w-auto object-contain shrink-0"
        />
      </div>
    );
  }

  const logoSize = variant === 'print' ? 'h-16 sm:h-20' : variant === 'auth' ? 'h-14 sm:h-16' : 'h-16 sm:h-24';

  return (
    <header
      className={`w-full bg-white ${
        variant === 'print'
          ? 'border-b-2 border-[#0F294A] pb-4 mb-6'
          : 'border-b border-slate-200 py-5 px-4 sm:px-8'
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 sm:gap-8">
        <div className="shrink-0 flex items-center justify-start">
          <img
            src="/assets/logos/logo-ykb.png"
            alt="Logo Yayasan Keluarga Batam (YKB)"
            className={`${logoSize} w-auto object-contain`}
          />
        </div>

        <div className="text-center flex-1 min-w-0">
          <h1 className="font-display font-extrabold text-xl sm:text-3xl tracking-tight text-[#0F294A]">
            KARTINI CBT
          </h1>
          <p className="text-xs sm:text-sm font-semibold tracking-wider text-[#1D4ED8] mt-0.5">
            ONLINE EXAMINATION SYSTEM
          </p>
          <div className="mt-2 pt-2 border-t border-slate-200/80 max-w-md mx-auto">
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              SMP KARTINI 1 BATAM
            </p>
            <p className="text-[11px] sm:text-xs font-medium text-slate-500">
              YAYASAN KELUARGA BATAM
            </p>
          </div>
          {subtitle && (
            <p className="mt-1.5 text-xs text-slate-600 font-medium">{subtitle}</p>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end">
          <img
            src="/assets/logos/logo-smp-kartini.png"
            alt="Logo SMP Kartini 1 Batam"
            className={`${logoSize} w-auto object-contain`}
          />
        </div>
      </div>
    </header>
  );
}
