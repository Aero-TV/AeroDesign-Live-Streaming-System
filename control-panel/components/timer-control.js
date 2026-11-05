import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

const PRESETS = [120, 180, 300, 600];

/**
 * Operator control for the takeoff countdown.
 *
 * Like the overlay's ring, the readout interpolates locally between polls so
 * the operator and the broadcast show the same number at the same instant.
 */
class TimerControl extends BaseComponent {
  constructor() {
    super();
    this._state = { timer: null };
    this._sync = null;
    this._tick = null;
  }

  connectedCallback() {
    this.render();
    this._tick = setInterval(() => this.renderTime(), 200);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._tick) clearInterval(this._tick);
  }

  styles() {
    return `
      ${THEME}

      .wrap { display: flex; flex-direction: column; gap: 15px; }

      .readout {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 16px 20px;
        border-radius: var(--radius);
        background: var(--surface-soft);
        border: 1px solid var(--surface-line);
        transition: border-color 400ms var(--ease-out);
      }

      .readout.warn { border-color: rgba(251, 191, 36, 0.45); }
      .readout.critical { border-color: rgba(248, 113, 113, 0.5); }

      .time {
        font-family: var(--font-display);
        font-variant-numeric: tabular-nums;
        font-size: 46px;
        font-weight: 700;
        line-height: 1;
      }

      .readout.warn .time { color: var(--warn); }
      .readout.critical .time { color: var(--bad); }

      .state { font-size: 13px; color: var(--text-muted); margin-left: auto; }

      .buttons { display: flex; gap: 9px; flex-wrap: wrap; }

      button {
        flex: 1;
        min-width: 84px;
        padding: 11px 14px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--surface-line);
        background: var(--surface-soft);
        color: var(--text);
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 180ms var(--ease-out), background 220ms var(--ease-out),
                    border-color 220ms var(--ease-out);
      }

      button:hover { background: rgba(34, 211, 238, 0.12); border-color: rgba(34, 211, 238, 0.4); }
      button:active { transform: scale(0.97); }

      button.primary {
        background: var(--accent-gradient);
        border-color: transparent;
        color: #05121C;
      }

      button.primary:hover { filter: brightness(1.08); }

      .presets { display: flex; gap: 7px; }

      .presets button {
        flex: 1;
        min-width: 0;
        padding: 8px 6px;
        font-size: 12px;
        color: var(--text-muted);
      }

      .presets button.active {
        border-color: rgba(34, 211, 238, 0.5);
        background: rgba(34, 211, 238, 0.12);
        color: var(--accent);
      }
    `;
  }

  template() {
    return `
      <div class="wrap">
        <div class="readout" id="readout">
          <span class="time" id="time">--:--</span>
          <span class="label">restantes</span>
          <span class="state" id="state">parado</span>
        </div>

        <div class="buttons">
          <button class="primary" id="startPause">Iniciar</button>
          <button id="reset">Zerar</button>
        </div>

        <div>
          <div class="label" style="margin-bottom:7px">Duração da janela</div>
          <div class="presets">
            ${PRESETS.map((s) => `
              <button data-seconds="${s}">${s / 60} min</button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  afterRender() {
    this.addManagedListener(this.$('#startPause'), 'click', () => {
      const running = this._sync && this._sync.running;
      this.emit(running ? 'timer-pause' : 'timer-start');
    });

    this.addManagedListener(this.$('#reset'), 'click', () => this.emit('timer-reset'));

    this.$$('.presets button').forEach((button) => {
      this.addManagedListener(button, 'click', () => {
        this.emit('timer-duration', { seconds: parseInt(button.dataset.seconds, 10) });
      });
    });
  }

  syncTimer(timer) {
    if (!timer) return;
    this._sync = {
      remaining: timer.remaining_seconds,
      duration: timer.duration_seconds,
      running: timer.running,
      at: performance.now()
    };
    this.setText('#startPause', timer.running ? 'Pausar' : 'Iniciar');
    this.setText('#state', timer.running ? 'em contagem' : (timer.expired ? 'encerrado' : 'parado'));

    this.$$('.presets button').forEach((button) => {
      this.setClass(button, 'active', parseInt(button.dataset.seconds, 10) === timer.duration_seconds);
    });

    this.renderTime();
  }

  remaining() {
    if (!this._sync) return null;
    const { remaining, running, at } = this._sync;
    if (!running) return remaining;
    return Math.max(0, remaining - (performance.now() - at) / 1000);
  }

  renderTime() {
    const remaining = this.remaining();
    if (remaining === null || !this.$('#time')) return;

    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    this.setText('#time', `${minutes}:${String(seconds).padStart(2, '0')}`);

    this.setClass('#readout', 'warn', remaining <= 60 && remaining > 20);
    this.setClass('#readout', 'critical', remaining <= 20);
  }
}

customElements.define('timer-control', TimerControl);
export default TimerControl;
