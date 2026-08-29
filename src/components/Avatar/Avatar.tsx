import './Avatar.css';

export interface AvatarProps {
  initials: string;
  /** Fixed per person, so someone is the same colour in every context. */
  hue: 0 | 1 | 2 | 3;
  size?: 24 | 28 | 36;
  name?: string;
}

/**
 * Avatar — initials on a filled circle.
 *
 * The Figma file once had an `Avatar · initials` component that hardcoded two
 * people's initials as VARIANTS, which is why it ended up with zero instances
 * and was deleted. Initials are data, not a variant axis: a variant set can
 * only ever hold the people you thought of when you built it.
 */
export function Avatar({ initials, hue, size = 28, name }: AvatarProps) {
  return (
    <span
      className={`gr-avatar gr-avatar--${hue} gr-type-micro`}
      style={{ width: size, height: size }}
      aria-hidden={name ? undefined : true}
      aria-label={name}
      title={name}
    >
      {initials}
    </span>
  );
}
