import { useEffect, useState } from 'react';
import { ME } from './chat';

/**
 * The signed-in person's own photo, when they have set one.
 *
 * Kept in localStorage rather than on a server because there is no account
 * system here — this is a prototype and the photo belongs to the browser that
 * uploaded it. That is a real limitation, not a hidden one: it does not follow
 * you to another machine, and the UI says so.
 */

const KEY = 'growth.avatar';
/* Same-tab writes do not fire `storage`, so components in this tab are told
   directly. Without it the sidebar keeps the old photo until a reload. */
const CHANGED = 'growth:avatar-changed';

export function getStoredAvatar(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setStoredAvatar(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(KEY, dataUrl);
    else localStorage.removeItem(KEY);
  } catch {
    /* Quota, or Safari private mode. Nothing to recover — the caller already
       has the image on screen; it just will not survive a reload. */
  }
  window.dispatchEvent(new Event(CHANGED));
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

/**
 * Square, centre-cropped, downscaled, re-encoded as JPEG.
 *
 * A phone photo is several megabytes and localStorage holds about five in
 * total — storing the original would fill the quota with one upload and throw
 * on the next write, somewhere unrelated. It is also pointless: this renders
 * at 28px.
 */
export function normaliseImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = AVATAR_PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      /* Centre crop: faces sit nearer the top of a portrait than the middle,
         so bias upward rather than taking the exact centre. */
      const sx = (img.width - side) / 2;
      const sy = Math.max(0, (img.height - side) / 2 - side * 0.08);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    img.src = url;
  });
}
