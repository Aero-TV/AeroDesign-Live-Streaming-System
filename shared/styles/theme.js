/**
 * Shared shadow-DOM styles.
 *
 * Custom properties cross the shadow boundary on their own, but keyframes and
 * classes do not. Components concatenate these strings into their styles() so
 * the whole overlay animates from one vocabulary.
 *
 * Motion rules for a broadcast overlay:
 *  - Nothing blinks. Continuous loops run 3s or slower at low amplitude, and
 *    opacity never drops below ~0.55, so the eye reads movement, not flicker.
 *  - Entrances are staggered with --i so panels assemble rather than pop.
 *  - Exits are faster than entrances; leaving should feel decisive.
 */

export const KEYFRAMES = `
  @keyframes rise-in {
    from { opacity: 0; transform: translateY(18px) scale(0.985); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes slide-in-left {
    from { opacity: 0; transform: translateX(-44px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes slide-in-right {
    from { opacity: 0; transform: translateX(44px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes drop-in {
    from { opacity: 0; transform: translateY(-100%); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* A slow highlight travelling across a panel. Gives the glass a sense of
     depth without drawing attention away from the video. */
  @keyframes sheen {
    0%   { transform: translateX(-120%); }
    100% { transform: translateX(320%); }
  }

  /* Expanding ring behind the live dot. */
  @keyframes pulse-ring {
    0%   { transform: scale(0.85); opacity: 0.7; }
    70%  { transform: scale(2.4); opacity: 0; }
    100% { transform: scale(2.4); opacity: 0; }
  }

  @keyframes breathe {
    0%, 100% { opacity: 0.65; }
    50%      { opacity: 1; }
  }

  /* Brief flash when a value changes, so the viewer notices the update. */
  @keyframes value-bump {
    0%   { transform: translateY(0); }
    35%  { transform: translateY(-5px); }
    100% { transform: translateY(0); }
  }

  @keyframes urgent-glow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); }
    50%      { box-shadow: 0 0 22px 3px rgba(248, 113, 113, 0.55); }
  }

  @keyframes sweep-line {
    0%   { transform: scaleX(0); transform-origin: left; }
    50%  { transform: scaleX(1); transform-origin: left; }
    51%  { transform: scaleX(1); transform-origin: right; }
    100% { transform: scaleX(0); transform-origin: right; }
  }
`;

/** Glass panel surface used by every overlay element. */
export const PANEL = `
  .panel {
    position: relative;
    background: var(--surface);
    backdrop-filter: blur(var(--blur)) saturate(1.3);
    -webkit-backdrop-filter: blur(var(--blur)) saturate(1.3);
    border: 1px solid var(--surface-line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  /* Accent rail along the leading edge. */
  .panel::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--edge);
    background: var(--accent-gradient);
    box-shadow: 0 0 16px var(--accent-glow);
  }

  /* The travelling sheen. Pointer-events off so it never blocks anything. */
  .panel::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 22%;
    background: linear-gradient(
      100deg,
      transparent,
      rgba(255, 255, 255, 0.055),
      transparent
    );
    animation: sheen 9s var(--ease-out) infinite;
    pointer-events: none;
  }
`;

/** Small uppercase label used above every value. */
export const LABEL = `
  .label {
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-dim);
    line-height: 1;
  }
`;

/** Tabular figures so numbers do not jitter as they tick. */
export const NUMERIC = `
  .numeric {
    font-family: var(--font-display);
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
    letter-spacing: 0.01em;
  }
`;

export const BASE = `
  :host {
    display: block;
    font-family: var(--font-body);
    color: var(--text);
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* Respect a viewer's reduced-motion setting: keep the layout, drop the loops. */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

/** Everything a component normally needs, in one string. */
export const THEME = `${BASE}${KEYFRAMES}${PANEL}${LABEL}${NUMERIC}`;

window.AeroTheme = { KEYFRAMES, PANEL, LABEL, NUMERIC, BASE, THEME };
