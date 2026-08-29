import { useRef, useState } from 'react';
import './AvatarUpload.css';
import { Avatar } from '../Avatar/Avatar';
import { ME } from '../../data/chat';
import { normaliseImage, setStoredAvatar, useMyAvatar } from '../../data/profile';

/**
 * Upload a profile photo.
 *
 * Drag-and-drop and a file picker, because one of the two is always the wrong
 * one: a picker is unusable when the file is already in front of you, and a
 * drop zone is unusable on a trackpad with the file three folders deep.
 *
 * The label is a real <label> wired to the input rather than a button that
 * calls .click(). A native file input is keyboard reachable and announces
 * itself; re-implementing it loses both and gains nothing.
 */
export function AvatarUpload() {
  const current = useMyAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      return setError('That is not an image. Try a JPG, PNG or WebP.');
    }
    /* Checked before reading rather than after: decoding a 40MB photo to find
       out it is too big freezes the tab for the length of the decode. */
    if (file.size > 12 * 1024 * 1024) {
      return setError('That image is over 12MB. Try a smaller one.');
    }
    setBusy(true);
    try {
      setStoredAvatar(await normaliseImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That image could not be read.');
    } finally {
      setBusy(false);
      /* Reset so choosing the same file twice still fires a change event. */
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="gr-upload">
      <Avatar initials={ME.initials} hue={ME.hue} size={64} src={current} name={ME.name} />

      <div
        className={`gr-upload__drop ${dragging ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          id="gr-avatar-input"
          className="gr-sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => void accept(e.target.files?.[0])}
        />
        <p className="gr-type-body">
          <label htmlFor="gr-avatar-input" className="gr-upload__label">
            {busy ? 'Working…' : 'Choose a photo'}
          </label>{' '}
          or drag one here
        </p>
        <p className="gr-type-caption gr-upload__hint">
          Square-cropped to 256px. Stored in this browser only — it will not
          follow you to another machine.
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
