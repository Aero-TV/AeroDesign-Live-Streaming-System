import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

/**
 * Announcement banner, centred below the status bar.
 *
 * Sits above the video's upper third where it reads clearly without covering
 * the aircraft, which stays in frame centre during a flight.
 */
class CustomMessage extends BaseComponent {
  constructor() {
    super();
    this._state = { message: '' };
  }

  connectedCallback() {
    this.render();
  }

  /** Rebuild on a new message so the entrance animation replays. */
  renderKey() {
    return this._state.message || 'empty';
  }

  styles() {
    return `
      ${THEME}

      :host {
        position: absolute;
        top: 122px;
        left: 0;
        right: 0;
        z-index: 850;
        display: flex;
        justify-content: center;
        opacity: 0;
        transform: translateY(-16px);
        transition:
          opacity var(--exit) var(--ease-in),
          transform var(--exit) var(--ease-in);
        pointer-events: none;
      }

      :host(.is-visible) {
        opacity: 1;
        transform: translateY(0);
        transition:
          opacity var(--enter) var(--ease-out),
          transform var(--enter) var(--ease-out);
      }

      .banner {
        display: flex;
        align-items: center;
        gap: 15px;
        max-width: 1100px;
        padding: 14px 28px 14px 22px;
        animation: rise-in var(--enter) var(--ease-out) both;
      }

      .mark {
        width: 4px;
        align-self: stretch;
        min-height: 26px;
        border-radius: 2px;
        background: var(--accent-gradient);
        box-shadow: 0 0 14px var(--accent-glow);
        flex: none;
      }

      .text {
        font-family: var(--font-display);
        font-size: 27px;
        font-weight: 600;
        letter-spacing: 0.03em;
        line-height: 1.15;
        text-shadow: 0 2px 14px rgba(0, 0, 0, 0.5);
      }
    `;
  }

  template() {
    if (!this._state.message) return '<div></div>';
    return `
      <div class="banner panel">
        <span class="mark"></span>
        <span class="text" id="text"></span>
      </div>
    `;
  }

  update() {
    this.setText('#text', this._state.message);
  }

  show(message) {
    this.setState({ message });
    this.setVisible(!!message);
  }

  hide() {
    this.setVisible(false);
  }
}

customElements.define('custom-message', CustomMessage);
export default CustomMessage;
