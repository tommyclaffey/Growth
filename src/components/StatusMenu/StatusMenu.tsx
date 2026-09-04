import { useRef, useState } from 'react';
import { useMenu } from '../../data/useMenu';
import './StatusMenu.css';
import { StatusPill, type Stage } from '../StatusPill/StatusPill';

const STAGES: Stage[] = ['Active', 'Paused', 'Review', 'Draft', 'Ended'];

export interface StatusMenuProps {
  value: Stage;
  onChange: (next: Stage) => void;
  disabled?: boolean;
}

/**
 * Status menu — the Status pill, made changeable.
 *
 * The pill deliberately has no text property, because the stage IS the label
 * and a text slot would let a Paused pill render the word "Active". This is
 * the counterpart: the only way to change a stage is to pick another real
 * stage, so the label can never disagree with the state it names.
 */
export function StatusMenu({ value, onChange, disabled = false }: StatusMenuProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  /* Outside-click, Escape with focus restore, and arrow-key navigation.
     All three menus declared role="listbox" and implemented none of it. */
  useMenu(open, setOpen, wrap);

  return (
    <div className="gr-statusmenu" ref={wrap}>
      <button
        type="button"
        className="gr-statusmenu__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${value}. Change status`}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        <StatusPill stage={value} />
      </button>

      {open && (
        <div className="gr-statusmenu__menu" role="listbox" aria-label="Status">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === value}
              className={`gr-statusmenu__row ${s === value ? 'is-selected' : ''}`}
              onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false); }}
            >
              <StatusPill stage={s} />
              {s === value && <span className="gr-statusmenu__check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
