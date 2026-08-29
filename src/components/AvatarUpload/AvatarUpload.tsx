import { useCallback, useEffect, useRef, useState } from 'react';
import './AvatarUpload.css';
import { Avatar } from '../Avatar/Avatar';
import { ME } from '../../data/chat';
import {
  DEFAULT_CROP, PREVIEW_PX, clampCrop, coverScale, loadImage, renderCrop,
  setStoredAvatar, useMyAvatar, type Crop,
} from '../../data/profile';

/**
 * Choose a photo, then place it.
 *
 * Auto-cropping to the centre is wrong often enough to matter — faces sit high
 * in a portrait, off to one side in a group shot — and a wrong crop with no way
 * to fix it is worse than no photo. So the file picker opens an editor rather
 * than committing straight away.
 *
 * Drag-and-drop and a picker both, because one of the two is always the wrong
 * one: a picker is unusable when the file is already in front of you, and a
 * drop zone is unusable on a trackpad with the file three folders deep.
 */
export function AvatarUpload() {
  const current = useMyAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Editor state — non-null while placing a newly chosen image. */
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  async function accept(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('That is not an image. Try a JPG, PNG or WebP.');
    /* Checked before decoding: decoding a 40MB photo only to reject it freezes
       the tab for the length of the decode. */
    if (file.size > 12 * 1024 * 1024) return setError('That image is over 12MB. Try a smaller one.');

    setBusy(true);
    try {
      const loaded = await loadImage(file);
      setImg(loaded);
      setCrop(DEFAULT_CROP);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That image could not be read.');
    } finally {
      setBusy(false);
      /* Reset so re-choosing the same file still fires a change event. */
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || !img) return;
    setCrop((c) => clampCrop(img, { ...c, x: d.cx + (e.clientX - d.x), y: d.cy + (e.clientY - d.y) }));
  }, [img]);

  const onUp = useCallback(() => { dragRef.current = null; }, []);

  /* Listeners on the window, not the element: a pointer that leaves the circle
     mid-drag should keep dragging, and should still release when let go
     outside it. */
  useEffect(() => {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [onMove, onUp]);

  function save() {
    if (!img) return;
    try {
      setStoredAvatar(renderCrop(img, crop));
      setImg(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That image could not be saved.');
    }
  }

  if (img) {
    const base = coverScale(img) * crop.scale;
    return (
      <div className="gr-upload gr-upload--editing">
        <div className="gr-crop">
          <div
            className="gr-crop__frame"
            style={{ width: PREVIEW_PX, height: PREVIEW_PX }}
            onPointerDown={(e) => {
              dragRef.current = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y };
            }}
          >
            <img
              className="gr-crop__img"
              src={img.src}
              alt=""
              draggable={false}
              style={{
                width: img.naturalWidth * base,
                height: img.naturalHeight * base,
                transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))`,
              }}
            />
            {/* Ring sits above the image so the circle edge stays visible while
                dragging, rather than being covered by the photo. */}
            <span className="gr-crop__ring" aria-hidden="true" />
          </div>

          <label className="gr-crop__zoom">
            <span className="gr-type-caption">Zoom</span>
            <input
              type="range" min={1} max={4} step={0.01} value={crop.scale}
              onChange={(e) => setCrop((c) => clampCrop(img, { ...c, scale: Number(e.target.value) }))}
            />
          </label>
          <p className="gr-type-caption gr-upload__hint">Drag the photo to reposition it.</p>
        </div>

        <div className="gr-crop__actions">
          <button type="button" className="gr-upload__save gr-type-body-medium" onClick={save}>Save</button>
          <button type="button" className="gr-upload__remove gr-type-caption" onClick={() => setImg(null)}>Cancel</button>
        </div>
        {error && <p className="gr-upload__error gr-type-caption" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="gr-upload">
      <Avatar initials={ME.initials} hue={ME.hue} size={64} src={current} name={ME.name} />

      <div
        className={`gr-upload__drop ${dragging ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void accept(e.dataTransfer.files?.[0]); }}
      >
        <input
          ref={inputRef} id="gr-avatar-input" className="gr-sr-only" type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => void accept(e.target.files?.[0])}
        />
        <p className="gr-type-body">
          <label htmlFor="gr-avatar-input" className="gr-upload__label">
            {busy ? 'Working…' : current ? 'Replace photo' : 'Choose a photo'}
          </label>{' '}
          or drag one here
        </p>
        <p className="gr-type-caption gr-upload__hint">
          You choose the crop. Stored in this browser only — it will not follow
          you to another machine.
        </p>
      </div>

      {current && (
        <button type="button" className="gr-upload__remove gr-type-caption"
                onClick={() => { setError(null); setStoredAvatar(null); }}>
          Remove
        </button>
      )}
      {error && <p className="gr-upload__error gr-type-caption" role="alert">{error}</p>}
    </div>
  );
}
