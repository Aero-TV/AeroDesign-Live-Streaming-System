import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

/** The actions the operator reaches for most during a broadcast. */
class ControlButtons extends BaseComponent {
  constructor() {
    super();
    this._state = { visible: false };
  }

  connectedCallback() {
    this.render();
  }

  styles() {
    return `
      ${THEME}

      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

      button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        padding: 15px 16px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--surface-line);
        background: var(--surface-soft);
        color: var(--text);
        font-family: var(--font-body);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 180ms var(--ease-out), background 220ms var(--ease-out),
                    border-color 220ms var(--ease-out), filter 220ms var(--ease-out);
      }

      button:hover { background: rgba(34, 211, 238, 0.1); border-color: rgba(34, 211, 238, 0.4); }
      button:active { transform: scale(0.97); }

      .wide { grid-column: 1 / -1; }

      #toggle {
        background: var(--accent-gradient);
        border-color: transparent;
        color: #05121C;
      }

      #toggle:hover { filter: brightness(1.08); }

      /* On air, the toggle becomes the "take it down" action and reads as one. */
      #toggle.live {
        background: linear-gradient(100deg, #F87171, #DC2626);
        color: #fff;
      }

      #next {
        border-color: rgba(52, 211, 153, 0.35);
        background: rgba(52, 211, 153, 0.1);
      }

      #next:hover { background: rgba(52, 211, 153, 0.18); border-color: var(--ok); }
    `;
  }

  template() {
    return `
      <div class="grid">
        <button class="wide" id="toggle" type="button">Colocar no ar</button>
        <button id="show" type="button">Mostrar</button>
        <button id="hide" type="button">Ocultar</button>
        <button class="wide" id="next" type="button">Próxima equipe da fila →</button>
      </div>
    `;
  }

  afterRender() {
    this.addManagedListener(this.$('#toggle'), 'click', () => this.emit('toggle-overlay'));
    this.addManagedListener(this.$('#show'), 'click', () => this.emit('show-overlay'));
    this.addManagedListener(this.$('#hide'), 'click', () => this.emit('hide-overlay'));
    this.addManagedListener(this.$('#next'), 'click', () => this.emit('advance-queue'));
  }

  update() {
    const live = this._state.visible;
    this.setClass('#toggle', 'live', live);
    this.setText('#toggle', live ? 'Tirar do ar' : 'Colocar no ar');
  }

  setVisibleState(visible) {
    this.setState({ visible });
  }
}

customElements.define('control-buttons', ControlButtons);
export default ControlButtons;
