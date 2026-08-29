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
      localStorage.removeItem(KEY);
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
