'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { COLORWAYS } from '@/lib/brand';
import { copyCardToClipboard, downloadCard, reopenX, shareToX } from '@/lib/share';
import type { BuilderInput, CardData } from '@/lib/types';
import ShareModal from './ShareModal';
import { BTN_PRIMARY, BTN_SECONDARY, LABEL } from './ui';

type Props = {
  /** What the card currently shows — placeholders filled in. Exports use this. */
  data: CardData;
  /** What the user has actually typed. The fields are bound to this, not to `data`. */
  input: BuilderInput;
  onInput: (patch: Partial<BuilderInput>) => void;
  onReroll: () => void;
  onFile: (file: File) => void;
};

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
  autoComplete,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength: number;
  autoComplete: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={`${id}-hint`}
        className="mt-1 w-full border-b-2 border-hh-cream/20 bg-transparent pb-1 font-mono text-[13px] text-hh-cream outline-none transition-colors placeholder:text-hh-cream/25 focus:border-hh-yellow sm:text-sm"
      />
      <span id={`${id}-hint`} className="sr-only">
        {hint}
      </span>
    </div>
  );
}

function XMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64Z" />
    </svg>
  );
}

function Reroll() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-1.6 5.6" strokeLinecap="round" />
      <path d="M20 4v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Dock({ data, input, onInput, onReroll, onFile }: Props) {
  const { identity, photo } = data;
  const swapRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [lastShareUrl, setLastShareUrl] = useState<string | undefined>(undefined);
  const inkName = useId();

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 7000);
    return () => clearTimeout(id);
  }, [note]);

  const run = async (kind: 'download' | 'share') => {
    setBusy(kind);
    setNote(null);
    try {
      if (kind === 'download') {
        await downloadCard(data);
        setNote('Saved. Look in your downloads for the PNG.');
      } else {
        const res = await shareToX(data);
        if (res.cancelled) {
          return;
        }
        if (res.attached) {
          setNote('Share sheet open, caption written, pass attached.');
        } else {
          setLastShareUrl(res.url);
          setShowShareModal(true);
          setNote('X is open! Pass image copied to clipboard — press Ctrl+V / Cmd+V into your post.');
        }
      }
    } catch (err) {
      setNote(
        err instanceof Error
          ? `That didn’t work: ${err.message} Try again, or download the PNG instead.`
          : 'That didn’t work. Try again in a moment.',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative px-2 pb-2 sm:px-4 sm:pb-[6vh]">
      {/* Toast sits above the dock so the dock's own height never jumps. */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-1 flex justify-center px-4"
        role="status"
        aria-live="polite"
      >
        {note && (
          <p className="max-w-[46ch] rounded-full bg-black/75 px-4 py-2 text-center font-mono text-[11px] leading-snug text-hh-cream backdrop-blur-md">
            {note}
          </p>
        )}
      </div>

      <div className="mx-auto flex max-w-[1080px] flex-col gap-3 rounded-t-[22px] border border-hh-cream/15 bg-black/35 p-3 backdrop-blur-2xl backdrop-saturate-150 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-end sm:gap-4 sm:rounded-full sm:px-5 sm:py-3.5 sm:[padding-bottom:0.875rem]">
        {/* Row 1 — who this is. */}
        <div className="flex items-end gap-3 sm:flex-1 sm:gap-4">
          <button
            type="button"
            onClick={() => swapRef.current?.click()}
            className="group relative size-11 shrink-0 overflow-hidden rounded-full border border-hh-cream/30 bg-hh-cream/10 transition hover:border-hh-cream/70 active:scale-95 sm:size-12"
          >
            {photo ? (
              <img src={photo.dataUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="font-mono text-[9px] uppercase tracking-widest text-hh-cream/60">
                Add
              </span>
            )}
            <span className="absolute inset-0 hidden place-items-center bg-black/60 font-mono text-[8px] uppercase tracking-widest text-hh-cream group-hover:grid">
              Swap
            </span>
            <span className="sr-only">Change photo</span>
          </button>
          <input
            ref={swapRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            aria-label="Choose a different photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onFile(file);
            }}
          />

          <Field
            label="Name or handle"
            hint="Printed large on the pass. Up to 28 characters."
            value={input.handle}
            onChange={(handle) => onInput({ handle })}
            placeholder="@yourhandle"
            maxLength={28}
            autoComplete="nickname"
          />
          <Field
            label="Stack or role"
            hint="Separate things with a comma or a slash. Drives your builder title."
            value={input.stack}
            onChange={(stack) => onInput({ stack })}
            placeholder="Rust · infra"
            maxLength={60}
            autoComplete="organization-title"
          />
        </div>

        {/* Row 2 — how it's printed. */}
        <div className="flex items-end justify-between gap-3 sm:justify-start sm:gap-4">
          <fieldset className="shrink-0">
            <legend className={LABEL}>Ink</legend>
            <div className="mt-1.5 flex gap-1.5">
              {COLORWAYS.map((c, i) => (
                <label key={c.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name={inkName}
                    className="peer sr-only"
                    checked={input.colorway === c.id}
                    onChange={() => onInput({ colorway: c.id })}
                  />
                  <span
                    aria-hidden="true"
                    className="grid size-7 place-items-center rounded-full border border-black/30 font-mono text-[10px] font-bold ring-hh-yellow ring-offset-2 ring-offset-[#0b1a12] transition peer-checked:ring-2 peer-focus-visible:ring-2"
                    style={{ background: c.stock, color: c.ink }}
                  >
                    {i + 1}
                  </span>
                  <span className="sr-only">{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="min-w-0">
            <span className={LABEL} aria-hidden="true">
              Title
            </span>
            <button
              type="button"
              onClick={onReroll}
              className="mt-1 flex max-w-[46vw] items-center gap-2 border-b-2 border-transparent pb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-hh-cream/85 transition hover:text-hh-cream sm:max-w-[15rem]"
            >
              <Reroll />
              <span className="truncate">{identity.title.replace(/^THE /, '')}</span>
            </button>
            <span className="sr-only" role="status" aria-live="polite">
              Builder title: {identity.title}. Activate to draw another.
            </span>
          </div>
        </div>

        {/* Row 3 — ship it. */}
        <div className="flex gap-2 sm:shrink-0">
          <button
            type="button"
            className={`${BTN_PRIMARY} flex-1 sm:flex-none`}
            onClick={() => run('download')}
            disabled={busy !== null}
          >
            {busy === 'download' ? 'Making the PNG…' : 'Download PNG'}
          </button>
          <button
            type="button"
            className={`${BTN_SECONDARY} flex-1 sm:flex-none`}
            onClick={() => run('share')}
            disabled={busy !== null}
          >
            <XMark />
            {busy === 'share' ? 'Opening…' : 'Share to X'}
          </button>
        </div>
      </div>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onCopyImage={() => copyCardToClipboard(data)}
        onReopenX={() => reopenX(data)}
        shareUrl={lastShareUrl}
      />
    </div>
  );
}
