'use client';

import { useEffect, useState } from 'react';
import { BRAND } from '@/lib/brand';
import { BTN_PRIMARY, BTN_SECONDARY } from './ui';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCopyImage: () => Promise<void>;
  onReopenX: () => void;
  shareUrl?: string;
};

export default function ShareModal({
  isOpen,
  onClose,
  onCopyImage,
  onReopenX,
  shareUrl,
}: Props) {
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await onCopyImage();
      setCopiedStatus('Copied to clipboard!');
      setTimeout(() => setCopiedStatus(null), 2500);
    } catch {
      setCopiedStatus('Could not copy image');
      setTimeout(() => setCopiedStatus(null), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-hh-cream/20 bg-[#071d12]/95 p-6 shadow-2xl backdrop-blur-2xl text-hh-cream">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close share dialog"
          className="absolute top-4 right-4 p-2 text-hh-cream/60 hover:text-hh-cream rounded-full hover:bg-white/10 transition"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="grid size-10 place-items-center rounded-full bg-hh-yellow/15 border border-hh-yellow/30 text-hh-yellow">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
              <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64Z" />
            </svg>
          </div>
          <div>
            <h2 id="share-modal-title" className="font-mono text-base font-bold text-hh-cream">
              Sharing to X (Twitter)
            </h2>
            <p className="font-mono text-xs text-hh-cream/60">
              X composer opened in a new tab
            </p>
          </div>
        </div>

        {/* Steps Guide */}
        <div className="space-y-3 my-5 font-mono text-xs">
          {/* Step 1: Clipboard Paste */}
          <div className="flex items-start gap-3 rounded-xl border border-hh-yellow/40 bg-hh-yellow/10 p-4">
            <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-hh-yellow text-hh-ink font-bold text-sm">
              ✨
            </div>
            <div>
              <p className="font-bold text-hh-yellow text-[14px]">
                Paste Image directly into Twitter
              </p>
              <p className="text-hh-cream/90 mt-1 leading-relaxed text-[12px]">
                Your pass image was automatically copied to your clipboard! In your open Twitter tab, simply press{' '}
                <kbd className="px-2 py-0.5 bg-black/60 rounded border border-hh-cream/40 text-white font-mono font-bold text-[11px]">
                  Ctrl + V
                </kbd>{' '}
                (or{' '}
                <kbd className="px-2 py-0.5 bg-black/60 rounded border border-hh-cream/40 text-white font-mono font-bold text-[11px]">
                  Cmd + V
                </kbd>
                ) to attach the pass image directly into the post!
              </p>
            </div>
          </div>

          {/* Step 2: Drag & Drop from Downloads */}
          <div className="flex items-start gap-3 rounded-xl border border-hh-cream/15 bg-white/5 p-3.5">
            <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-hh-cream/20 text-hh-cream font-bold text-xs">
              📁
            </div>
            <div>
              <p className="font-bold text-hh-cream text-[13px]">
                Backup: Drag & Drop from Downloads
              </p>
              <p className="text-hh-cream/70 mt-1 leading-relaxed text-[11px]">
                The high-res pass PNG was also saved to your downloads folder. You can drag and drop it straight into Twitter&apos;s composer.
              </p>
            </div>
          </div>
        </div>

        {/* Buttons / Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-hh-cream/10">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg border border-hh-cream/20 bg-white/10 px-3 py-1.5 font-mono text-xs text-hh-cream hover:bg-white/20 transition active:scale-95"
            >
              {copiedStatus ?? 'Copy Image Again'}
            </button>
            <button
              type="button"
              onClick={onReopenX}
              className="rounded-lg border border-hh-cream/20 bg-white/10 px-3 py-1.5 font-mono text-xs text-hh-cream hover:bg-white/20 transition active:scale-95"
            >
              Re-open X
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`${BTN_PRIMARY} text-xs py-1.5 px-4`}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
