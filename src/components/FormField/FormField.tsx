import { useId } from 'react';
import './FormField.css';

export interface FormFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  type?: 'text' | 'email' | 'number';
  disabled?: boolean;
  /** Hides the label visually but keeps it for screen readers. */
  labelHidden?: boolean;
}

/**
 * Form field — label, input, and one slot beneath for a hint or an error.
 *
 * The focus ring hosts on the INPUT, not on the whole field. That is how the
 * Figma component is built, and it matters: a ring around the label as well
 * would imply the label is part of the target, and it is not.
 *
 * Hint and error share one row rather than stacking, so the field never
 * changes height when validation fires. A form that grows as you fill it in
 * pushes the submit button away from the cursor.
 */
export function FormField({
  label, value, onChange, placeholder, hint, error,
  type = 'text', disabled = false, labelHidden = false,
}: FormFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-msg` : hint ? `${id}-msg` : undefined;

  return (
    <div className={`gr-field ${error ? 'is-invalid' : ''}`}>
      <label htmlFor={id} className={`gr-field__label gr-type-label-field ${labelHidden ? 'gr-sr-only' : ''}`}>
        {label}
      </label>
      <input
        id={id}
        className="gr-field__input gr-type-body"
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      <span id={`${id}-msg`} className="gr-field__msg gr-type-caption">
        {error ?? hint ?? ''}
      </span>
    </div>
  );
}
