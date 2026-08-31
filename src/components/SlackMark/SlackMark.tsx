/**
 * Slack's mark.
 *
 * One copy. It is needed on the message badge and on the connect button, and
 * a second hand-pasted set of paths is how two versions of a logo end up in
 * one product with slightly different geometry.
 *
 * Slack's colours are reproduced as Slack ships them and are not tokenised —
 * brand artwork is externally owned, the same exception this system already
 * makes for TikTok pink.
 */
export function SlackMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 122.8 122.8" aria-hidden="true"
         style={{ display: 'block', flex: 'none' }}>
      <path d="M25.8 77.6a12.9 12.9 0 1 1-12.9-12.9h12.9v12.9zm6.5 0a12.9 12.9 0 0 1 25.8 0v32.3a12.9 12.9 0 0 1-25.8 0V77.6z" fill="#E01E5A" />
      <path d="M45.2 25.8a12.9 12.9 0 1 1 12.9-12.9v12.9H45.2zm0 6.5a12.9 12.9 0 0 1 0 25.8H12.9a12.9 12.9 0 0 1 0-25.8h32.3z" fill="#36C5F0" />
      <path d="M97 45.2a12.9 12.9 0 1 1 12.9 12.9H97V45.2zm-6.5 0a12.9 12.9 0 0 1-25.8 0V12.9a12.9 12.9 0 0 1 25.8 0v32.3z" fill="#2EB67D" />
      <path d="M77.6 97a12.9 12.9 0 1 1-12.9 12.9V97h12.9zm0-6.5a12.9 12.9 0 0 1 0-25.8h32.3a12.9 12.9 0 0 1 0 25.8H77.6z" fill="#ECB22E" />
    </svg>
  );
}
