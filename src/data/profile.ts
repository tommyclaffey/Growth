import { useEffect, useState } from 'react';
import { ME, type Member } from './chat';

/**
 * The signed-in person's own photo, when they have set one.
 *
 * Kept in localStorage rather than on a server because there is no account
 * system here — this is a prototype and the photo belongs to the browser that
 * uploaded it. That is a real limitation, not a hidden one: it does not follow
 * you to another machine, and the UI says so.
 */

const KEY = 'growth.avatar';
/* The source image and the crop are kept beside the rendered avatar so the
   crop stays editable. Re-cropping the 256px render would compound the loss
   and could never recover what the first crop cut away — "adjust" has to go
   back to the original, not to the output. */
const SRC_KEY = 'growth.avatar.source';
const CROP_KEY = 'growth.avatar.crop';
/* Big enough to re-crop and zoom against, small enough to sit in a ~5MB quota
   alongside everything else. */
const SOURCE_MAX_PX = 900;
/* Same-tab writes do not fire `storage`, so components in this tab are told
   directly. Without it the sidebar keeps the old photo until a reload. */
const CHANGED = 'growth:avatar-changed';

/**
 * Written in place of the image when the photo is removed.
 *
 * "Never uploaded" and "deliberately removed" are different states and used to
 * be stored as the same one -- absent. Because the fallback is a bundled
 * photo, Remove cleared localStorage, the fallback took over, and the picture
 * stayed exactly where it was. The button reported success and the only thing
 * that changed was invisible.
 */
const REMOVED = '';

export function getStoredAvatar(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setStoredAvatar(dataUrl: string | null, source?: string, crop?: Crop) {
  try {
    if (dataUrl) {
      localStorage.setItem(KEY, dataUrl);
      if (source) localStorage.setItem(SRC_KEY, source);
      if (crop) localStorage.setItem(CROP_KEY, JSON.stringify(crop));
    } else {
      /* The sentinel, not removeItem -- an absent key means "never set", which
         is the state that falls back to the bundled photo. */
      localStorage.setItem(KEY, REMOVED);
      localStorage.removeItem(SRC_KEY);
      localStorage.removeItem(CROP_KEY);
    }
  } catch {
    /* Quota, or Safari private mode. Nothing to recover — the caller already
       has the image on screen; it just will not survive a reload. */
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** The image the current avatar was cropped from, and where it was cropped. */
export function getStoredSource(): { src: string; crop: Crop } | null {
  try {
    const src = localStorage.getItem(SRC_KEY);
    if (!src) return null;
    const raw = localStorage.getItem(CROP_KEY);
    return { src, crop: raw ? (JSON.parse(raw) as Crop) : DEFAULT_CROP };
  } catch {
    return null;
  }
}

/**
 * The photo to show for any person.
 *
 * Returns a resolver rather than a value because the answer differs by member:
 * the signed-in person's photo can be overridden locally, everyone else's
 * comes with them. Patching each call site instead is how the sidebar ended up
 * showing an uploaded photo while the chat panel two panes over still showed
 * the bundled one — the same fact, read from two places, disagreeing.
 */
export function useAvatarFor(): (m: Member) => string | undefined {
  const mine = useMyAvatar();
  return (m: Member) => (m.id === ME.id ? mine : m.avatar);
}

/** The photo to show for the signed-in person: uploaded, else the bundled one. */
export function useMyAvatar(): string | undefined {
  const [stored, setStored] = useState<string | null>(() => getStoredAvatar());
  useEffect(() => {
    const sync = () => setStored(getStoredAvatar());
    window.addEventListener(CHANGED, sync);
    /* Another tab. */
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  /* Removed -> no photo at all, which is what Avatar renders initials for.
     Never set -> the bundled photo. */
  if (stored === REMOVED) return undefined;
  return stored ?? ME.avatar;
}

export const AVATAR_PX = 256;

/** Where the crop sits: zoom, plus an offset in preview pixels from centre. */
export interface Crop { scale: number; x: number; y: number }

export const DEFAULT_CROP: Crop = { scale: 1, x: 0, y: 0 };
/** The circular preview is this wide, and the crop maths is expressed in it. */
export const PREVIEW_PX = 220;

/** Loads any image source — a File or a data URL. */
export function loadImageSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be read.'));
    img.src = src;
  });
}

/**
 * A storable copy of the original.
 *
 * Kept at up to 900px so the crop can be re-opened and re-zoomed later without
 * going back to the file, which the browser cannot do — a File is gone the
 * moment the page reloads.
 */
export function toStorableSource(img: HTMLImageElement): string {
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  const k = long > SOURCE_MAX_PX ? SOURCE_MAX_PX / long : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    img.src = url;
  });
}

/**
 * The scale at which the image exactly covers the circle.
 *
 * Everything else is expressed as a multiple of this, so `scale: 1` always
 * means "fills the frame" regardless of whether the source is 400px or 4000px
 * — otherwise the zoom slider would mean something different for every photo.
 */
export function coverScale(img: HTMLImageElement): number {
  return PREVIEW_PX / Math.min(img.naturalWidth, img.naturalHeight);
}

/** Keeps the image covering the circle, so no gap can be dragged into view. */
export function clampCrop(img: HTMLImageElement, crop: Crop): Crop {
  const scale = Math.max(1, Math.min(4, crop.scale));
  const base = coverScale(img);
  const w = img.naturalWidth * base * scale;
  const h = img.naturalHeight * base * scale;
  const maxX = Math.max(0, (w - PREVIEW_PX) / 2);
  const maxY = Math.max(0, (h - PREVIEW_PX) / 2);
  return {
    scale,
    x: Math.max(-maxX, Math.min(maxX, crop.x)),
    y: Math.max(-maxY, Math.min(maxY, crop.y)),
  };
}

/**
 * Renders the chosen crop to a square JPEG data URL.
 *
 * A phone photo is several megabytes and localStorage holds about five in
 * total — storing the original would fill the quota on the first upload and
 * then throw on some unrelated write later. It is also pointless: this renders
 * at 28px in the sidebar.
 *
 * The canvas is drawn with the same transform the preview uses, scaled up from
 * the preview size to the output size. Re-deriving the maths for export is how
 * a crop editor ends up showing one thing and saving another.
 */
export function renderCrop(img: HTMLImageElement, crop: Crop): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const k = AVATAR_PX / PREVIEW_PX;
  const base = coverScale(img) * crop.scale * k;
  const w = img.naturalWidth * base;
  const h = img.naturalHeight * base;
  ctx.drawImage(img, (AVATAR_PX - w) / 2 + crop.x * k, (AVATAR_PX - h) / 2 + crop.y * k, w, h);
  return canvas.toDataURL('image/jpeg', 0.86);
}


/* ---------- workspace name ----------

   Settings promised this was "shown in the sidebar and on exports" and it was
   shown in neither -- the sidebar hardcoded GROWTH and the CSV never read it.
   A field that claims an effect it does not have is worse than a disabled one,
   because the user only finds out by checking. Made true rather than removed:
   the claim was a reasonable thing to want. */
const WORKSPACE_KEY = 'growth.workspace';
const WORKSPACE_CHANGED = 'growth:workspace-changed';
/* The workspace belongs to the ADVERTISER, not to this product.
   It defaulted to "Growth", which reads as the reporting tool naming itself --
   the same conflation that had the ad creative advertising Growth inside
   Growth's own campaign view. A customer's workspace is their company. */
export const DEFAULT_WORKSPACE = 'Foxglove Supply';

export function workspaceName(): string {
  try { return localStorage.getItem(WORKSPACE_KEY) || DEFAULT_WORKSPACE; }
  catch { return DEFAULT_WORKSPACE; }
}

export function setWorkspaceName(name: string) {
  const next = name.trim() || DEFAULT_WORKSPACE;
  try { localStorage.setItem(WORKSPACE_KEY, next); } catch { /* quota */ }
  window.dispatchEvent(new Event(WORKSPACE_CHANGED));
}

export function useWorkspaceName(): string {
  const [n, setN] = useState(workspaceName);
  useEffect(() => {
    const sync = () => setN(workspaceName());
    window.addEventListener(WORKSPACE_CHANGED, sync);
    return () => window.removeEventListener(WORKSPACE_CHANGED, sync);
  }, []);
  return n;
}


/* ---------- monthly budget ----------

   "Pace to target" was a hardcoded 64% -- the same on every channel, every
   range, and still 64% with a filled bar after every channel was switched off
   and the card beside it read $0. It is the only KPI that answers a forward
   question ("am I on track") rather than a backward one, so it is worth making
   real rather than deleting.

   $250,000 is the default because it is what makes the original 64% true:
   $160,780 of 30-day spend against $250k is 64.3%. The number on the screen
   does not move; it just becomes derived instead of typed. */
const BUDGET_KEY = 'growth.budget';
const BUDGET_CHANGED = 'growth:budget-changed';
export const DEFAULT_BUDGET = 250_000;

export function monthlyBudget(): number {
  try {
    const n = Number(localStorage.getItem(BUDGET_KEY));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET;
  } catch { return DEFAULT_BUDGET; }
}

export function setMonthlyBudget(v: number) {
  const next = Number.isFinite(v) && v > 0 ? Math.round(v) : DEFAULT_BUDGET;
  try { localStorage.setItem(BUDGET_KEY, String(next)); } catch { /* quota */ }
  window.dispatchEvent(new Event(BUDGET_CHANGED));
}

export function useMonthlyBudget(): number {
  const [b, setB] = useState(monthlyBudget);
  useEffect(() => {
    const sync = () => setB(monthlyBudget());
    window.addEventListener(BUDGET_CHANGED, sync);
    return () => window.removeEventListener(BUDGET_CHANGED, sync);
  }, []);
  return b;
}

/**
 * Budget for the selected window, prorated from the monthly figure.
 *
 * Comparing 7 days of spend to a whole month's budget would read as wildly
 * under-pace and mean nothing. Prorating keeps the question honest: "of the
 * money planned for this many days, how much is spent."
 *
 * Deliberately NOT month-to-date: the seeded data has a frozen PERIOD_END, so
 * anything claiming to know today's date would be a lie. This compares against
 * the range actually selected, which is true.
 */
export function budgetForRange(days: number): number {
  return (monthlyBudget() / 30) * days;
}
