'use client';

/**
 * Download and share. The other half of the brief:
 * "Pre-filled caption + hashtag #FrameInGoa. If you share via link rather than
 *  direct image attach, make sure the link preview (OG image) actually shows
 *  the generated graphic, not a blank/default thumbnail."
 *
 * Two paths, in preference order:
 *
 *   1. Web Share API Level 2 — attaches the actual PNG to the X composer. This
 *      is the best outcome and the only one where the image is guaranteed to be
 *      the real thing, because it *is* the real thing. Phones only.
 *   2. x.com/intent/post?text=…&url=… — X does not accept an image through the
 *      intent URL, so the link's OG image has to be the card. That means the
 *      PNG must already exist at a public URL by the time the composer opens,
 *      which is why publishing runs speculatively in the background (see
 *      `prepareShare`) instead of on the Share tap.
 */

import { EVENT } from './brand';
import { ExportError, exportOgPng, exportPng } from './export';
import type { CardData } from './types';
import {
  MAX_TOTAL_BYTES,
  type PublishConfigResponse,
  type PublishResponse,
} from '../app/api/publish/schema';

// ---------------------------------------------------------------- caption

/**
 * X's weighted character count: most of Latin-1, general punctuation and a few
 * other ranges cost 1; everything else (emoji, CJK, Devanagari) costs 2.
 * Worth implementing properly — a builder with an emoji handle and a long
 * generated title lands right on the boundary.
 */
function weight(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    const cheap =
      (c >= 0 && c <= 4351) ||
      (c >= 8192 && c <= 8205) ||
      (c >= 8208 && c <= 8223) ||
      (c >= 8242 && c <= 8247);
    n += cheap ? 1 : 2;
  }
  return n;
}

const X_LIMIT = 280;
/** Every URL costs a flat 23 under t.co, plus the newline we join it with. */
const URL_COST = 24;
const CAPTION_BUDGET = X_LIMIT - URL_COST;

function truncateTo(text: string, budget: number): string {
  if (weight(text) <= budget) return text;
  const chars = [...text];
  let out = '';
  let used = 0;
  for (const ch of chars) {
    const w = weight(ch);
    if (used + w > budget - 1) break;
    out += ch;
    used += w;
  }
  return `${out.trimEnd()}…`;
}

/**
 * The pre-filled post. Written the way a person would actually post it: the
 * generated builder title and the stack they typed are the interesting part,
 * so they carry the middle line. #FrameInGoa is required by the brief and is
 * never dropped, whatever else has to give.
 */
export function caption(data: CardData): string {
  const title = data.identity.title.trim();
  const stack = data.input.stack.trim();

  const opener = 'Locked in for Hacker House Goa 2026. 🌴';
  const identity = [title, stack].filter(Boolean).join(' · ');
  const tagline = 'Less noise. More signal.';
  const tag = EVENT.hashtag;

  const build = (lines: string[]) => lines.filter(Boolean).join('\n');

  let text = build([opener, identity, tagline, tag]);
  if (weight(text) <= CAPTION_BUDGET) return text;

  // First thing to go is the tagline — it's the line the card already says.
  text = build([opener, identity, tag]);
  if (weight(text) <= CAPTION_BUDGET) return text;

  // Then trim the identity line, which is the only unbounded part.
  const fixed = weight(build([opener, '', tag]));
  return build([opener, truncateTo(identity, Math.max(8, CAPTION_BUDGET - fixed)), tag]);
}

// ---------------------------------------------------------------- download

export function cardFilename(data: CardData): string {
  return `hhgoa-pass-${String(data.identity.serial).padStart(4, '0')}.png`;
}

/**
 * Save the card as a real file on the user's device.
 *
 * The object URL is revoked on a timer rather than immediately: revoking in the
 * same tick cancels the download in Firefox and older Safari. Not revoking at
 * all leaks ~2MB per render, and this tool is built to be re-rendered — every
 * colourway tap, every keystroke — so the leak is not theoretical.
 */
export async function downloadCard(data: CardData): Promise<void> {
  const blob = await cachedCardPng(data);
  const href = URL.createObjectURL(blob);

  try {
    const a = document.createElement('a');
    a.href = href;
    a.download = cardFilename(data);
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 5_000);
  }
}

// ---------------------------------------------------------------- identity of a render

/**
 * A stable key for "this exact card". Changes when anything visible changes,
 * including the photo and how it's framed — otherwise a re-crop would silently
 * share the previous upload. The photo data URI is megabytes long, so it's
 * fingerprinted by length plus its tail rather than hashed in full.
 */
function cardKey(data: CardData): string {
  const { input, identity, photo } = data;
  const p = photo
    ? `${photo.dataUrl.length}:${photo.dataUrl.slice(-24)}:${photo.transform.x.toFixed(3)},${photo.transform.y.toFixed(3)},${photo.transform.zoom.toFixed(3)}`
    : 'nophoto';
  return [identity.seed, input.colorway, identity.title, p].join('|');
}

/** Small bounded caches — a few renders back, not a session-long history. */
function lru<V>(cap: number) {
  const map = new Map<string, V>();
  return {
    get: (k: string) => map.get(k),
    del: (k: string) => map.delete(k),
    set: (k: string, v: V) => {
      if (map.has(k)) map.delete(k);
      map.set(k, v);
      while (map.size > cap) map.delete(map.keys().next().value as string);
    },
  };
}

const pngCache = lru<Promise<Blob>>(3);

/** Rasterise once per distinct card; Share and Download reuse the same bytes. */
function cachedCardPng(data: CardData): Promise<Blob> {
  const key = cardKey(data);
  const hit = pngCache.get(key);
  if (hit) return hit;

  const job = exportPng(data);
  pngCache.set(key, job);
  // Never cache a failure — the next tap deserves a fresh attempt. The handler
  // also keeps this from surfacing as an unhandled rejection when the caller
  // that started the render has already moved on.
  job.catch(() => {
    if (pngCache.get(key) === job) pngCache.del(key);
  });
  return job;
}

// ---------------------------------------------------------------- publishing

export type PublishOutcome =
  | { status: 'published'; id: string; url: string; cardUrl: string; ogUrl: string }
  /** No Blob store on this deploy. Expected in local dev. Not an error. */
  | { status: 'unconfigured' }
  /** Nothing to publish yet (no photo). */
  | { status: 'skipped' }
  | { status: 'failed'; message: string };

const jobs = lru<Promise<PublishOutcome>>(4);
const settled = lru<PublishOutcome>(8);
let inFlight: AbortController | null = null;
/** Once the server says "no store", stop asking on every keystroke. */
let storeUnconfigured = false;

/**
 * Kick off the upload in the background, the moment a card first renders.
 *
 * By the time anyone taps Share the URL already exists, so the Share button
 * never waits on a network round-trip. Call it whenever the card settles
 * (debounced by the caller); repeat calls for the same card are free, and a
 * call for a *different* card aborts the previous upload rather than racing it.
 *
 * Never rejects. The share flow degrades to Web-Share-only if this fails.
 */
export function prepareShare(data: CardData): Promise<PublishOutcome> {
  if (typeof window === 'undefined') return Promise.resolve({ status: 'skipped' });

  // Nothing worth a permanent URL until there's a photo on the card.
  if (!data.photo) return Promise.resolve({ status: 'skipped' });

  const key = cardKey(data);
  const existing = jobs.get(key);
  if (existing) return existing;

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;

  const job = publish(data, controller.signal)
    .catch((err: unknown): PublishOutcome => {
      if (controller.signal.aborted) return { status: 'skipped' };
      const message = err instanceof Error ? err.message : 'Upload failed.';
      return { status: 'failed', message };
    })
    .then((outcome) => {
      settled.set(key, outcome);
      if (inFlight === controller) inFlight = null;
      return outcome;
    });

  jobs.set(key, job);
  return job;
}

/** The last known outcome for this card, without starting or awaiting anything. */
export function peekShare(data: CardData): PublishOutcome | null {
  return settled.get(cardKey(data)) ?? null;
}

/** The share URL if we already have one, without waiting. */
export function peekShareUrl(data: CardData): string | null {
  const outcome = peekShare(data);
  return outcome?.status === 'published' ? outcome.url : null;
}

/** Encode card metadata to a compact base64url string for stateless link previews */
export function encodeCardPayload(data: CardData): string {
  const payload = {
    h: data.input.handle,
    s: data.input.stack,
    t: data.identity.title,
    n: data.identity.serial,
    c: data.input.colorway,
  };
  const jsonStr = encodeURIComponent(JSON.stringify(payload));
  if (typeof btoa !== 'undefined') {
    return btoa(jsonStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return Buffer.from(jsonStr).toString('base64url');
}

/** Generate a stateless share link that displays the dynamic card preview */
export function fallbackShareUrl(data: CardData): string {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
  return `${origin}/c/p/${encodeCardPayload(data)}`;
}

/**
 * The share URL, waiting up to `timeoutMs` for an in-flight upload.
 * Falls back to a dynamic stateless URL so every share has a working card preview.
 */
export async function shareUrl(data: CardData, timeoutMs = 2_000): Promise<string> {
  const ready = peekShareUrl(data);
  if (ready) return ready;

  if (data.photo) {
    try {
      const job = prepareShare(data);
      const outcome = await Promise.race([
        job,
        new Promise<PublishOutcome>((resolve) =>
          setTimeout(() => resolve({ status: 'failed', message: 'timeout' }), timeoutMs),
        ),
      ]);
      if (outcome.status === 'published') return outcome.url;
    } catch {
      // fallback to dynamic URL below
    }
  }

  return fallbackShareUrl(data);
}

async function publish(data: CardData, signal: AbortSignal): Promise<PublishOutcome> {
  // Rasterise the card first regardless — even if there's no store, having the
  // PNG warm makes the Web Share path instant.
  let card = await cachedCardPng(data);
  if (signal.aborted) return { status: 'skipped' };
  if (storeUnconfigured) return { status: 'unconfigured' };

  const og = await exportOgPng(data);
  if (signal.aborted) return { status: 'skipped' };

  // Vercel caps a route-handler body at ~4.5MB and PNG compresses photographic
  // content badly. Shrink the *uploaded copy* of the card if the pair won't
  // fit; the downloaded file is always full 1080×1350.
  for (const scale of [0.8, 0.6, 0.45]) {
    if (card.size + og.size <= MAX_TOTAL_BYTES) break;
    card = await exportPng(data, { scale });
    if (signal.aborted) return { status: 'skipped' };
  }

  const form = new FormData();
  form.append('card', new File([card], 'card.png', { type: 'image/png' }));
  form.append('og', new File([og], 'og.png', { type: 'image/png' }));
  form.append(
    'meta',
    JSON.stringify({
      handle: data.input.handle,
      stack: data.input.stack,
      title: data.identity.title,
      serial: data.identity.serial,
      colorway: data.input.colorway,
    }),
  );

  const res = await fetch('/api/publish', { method: 'POST', body: form, signal });
  const body = (await res.json()) as PublishResponse;

  if (body.ok) {
    return {
      status: 'published',
      id: body.id,
      url: body.url,
      cardUrl: body.cardUrl,
      ogUrl: body.ogUrl,
    };
  }

  if (body.reason === 'not_configured') {
    storeUnconfigured = true;
    return { status: 'unconfigured' };
  }

  return { status: 'failed', message: body.message };
}

/** Ask the server whether link sharing is possible at all. Cheap, cached. */
let configProbe: Promise<boolean> | null = null;
export function linkSharingAvailable(): Promise<boolean> {
  if (storeUnconfigured) return Promise.resolve(false);
  configProbe ??= fetch('/api/publish')
    .then((r) => r.json() as Promise<PublishConfigResponse>)
    .then((c) => {
      if (!c.configured) storeUnconfigured = true;
      return c.configured;
    })
    .catch(() => false);
  return configProbe;
}

// ---------------------------------------------------------------- share to X

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /abort|cancel/i.test(err.message));
}

/**
 * Should we try to hand X an actual file?
 *
 * Only on a touch-primary device. Desktop Chrome reports canShare({files}) on
 * Windows and ChromeOS, but the OS share sheet it opens has no X target — the
 * user gets a dialog full of irrelevant apps instead of a composer. On desktop
 * the intent URL plus a real OG image is strictly the better outcome.
 */
export function canAttachImage(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  if (typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches) return false;
  try {
    const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function openIntent(text: string, url?: string | null): void {
  const parts = [`text=${encodeURIComponent(text)}`];
  if (url) parts.push(`url=${encodeURIComponent(url)}`);
  const href = `https://x.com/intent/post?${parts.join('&')}`;

  const win = window.open(href, '_blank', 'noopener,noreferrer');
  // Popup blockers fire on any await between the tap and window.open. Falling
  // back to a same-tab navigation is worse UX but infinitely better than a
  // Share button that appears to do nothing.
  if (!win) window.location.href = href;
}

export type ShareToXResult = {
  attached?: boolean;
  copied?: boolean;
  downloaded?: boolean;
  url?: string;
  cancelled?: boolean;
};

/**
 * Open X with the caption pre-filled — with the PNG attached where the platform
 * allows it, copied to clipboard for easy pasting on desktop (Ctrl+V), and with a
 * link whose preview is the card graphic.
 */
export async function shareToX(data: CardData, publishedUrl?: string): Promise<ShareToXResult> {
  const text = caption(data);
  const url = publishedUrl ?? (await shareUrl(data, 2_000));

  if (canAttachImage()) {
    try {
      const blob = await cachedCardPng(data);
      const file = new File([blob], cardFilename(data), { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: url ? `${text}\n${url}` : text });
        return { attached: true, url };
      }
    } catch (err) {
      // The user closing the share sheet is a normal outcome, not a failure.
      if (isAbort(err)) return { cancelled: true };
      if (err instanceof ExportError) throw err;
    }
  }

  // Copy image to clipboard so desktop users can paste it directly into X
  let copied = false;
  try {
    const blob = await cachedCardPng(data);
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || 'image/png']: blob }),
      ]);
      copied = true;
    }
  } catch {
    // Clipboard write may be restricted or unsupported; fallback to link/download
  }

  // Auto-download on desktop so the user also has the PNG in their downloads
  let downloaded = false;
  try {
    await downloadCard(data);
    downloaded = true;
  } catch {
    // Non-critical
  }

  // Open Twitter composer with clean caption (without ugly long link)
  openIntent(text);

  return { attached: false, copied, downloaded, url };
}

/** Copy the high-res card image to system clipboard */
export async function copyCardToClipboard(data: CardData): Promise<void> {
  const blob = await cachedCardPng(data);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type || 'image/png']: blob }),
    ]);
  } else {
    throw new Error('Clipboard API not supported in this browser.');
  }
}

/** Re-open X composer with pre-filled caption */
export function reopenX(data: CardData): void {
  const text = caption(data);
  openIntent(text);
}

