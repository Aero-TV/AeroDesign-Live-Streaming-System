import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

/** Transient confirmation of an operator action. */
class NotificationToast extends BaseComponent {
  constructor() {
    super();
    this._state = { message: '', type: 'success', visible: false };
    this._hideTimer = null;
  }

  connectedCallback() {
    this.render();
  }

  styles() {
    return `
      ${THEME}

      :host {
        position: fixed;
        right: 26px;
        bottom: 26px;
        z-index: 5000;
        pointer-events: none;
      }

      .toast {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        border-radius: var(--radius);
        background: var(--surface-strong);
        border: 1px solid var(--surface-line);
        box-shadow: var(--shadow);
        backdrop-filter: blur(var(--blur));
        font-size: 14px;
        font-weight: 500;
        opacity: 0;
        transform: translateY(16px) scale(0.97);
        transition:
          opacity var(--exit) var(--ease-in),
          transform var(--exit) var(--ease-in);
      }

      .toast.show {
        opacity: 1;
        transform: translateY(0) scale(1);
        transition:
          opacity 380ms var(--ease-out),
          transform 380ms var(--ease-out);
      }

      .toast::before {
        content: '';
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex: none;
      }

      .toast.success::before { background: var(--ok); box-shadow: 0 0 12px var(--ok-glow); }
      .toast.error::before   { background: var(--bad); box-shadow: 0 0 12px var(--bad-glow); }
      .toast.info::before    { background: var(--accent); box-shadow: 0 0 12px var(--accent-glow); }

      .toast.error { border-color: rgba(248, 113, 113, 0.4); }
    `;
  }

  template() {
    return `<div class="toast" id="toast"><span id="message"></span></div>`;
  }

  update() {
    const { message, type, visible } = this._state;
    const toast = this.$('#toast');
    if (!toast) return;

    this.setText('#message', message);
    toast.className = `toast ${type}${visible ? ' show' : ''}`;
  }

  show(message, type = 'success', duration = 2600) {
    if (this._hideTimer) clearTimeout(this._hideTimer);
    this.setState({ message, type, visible: true });
    this._hideTimer = setTimeout(() => this.setState({ visible: false }), duration);
  }
}

customElements.define('notification-toast', NotificationToast);
export default NotificationToast;
