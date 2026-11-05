import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

const PANEL_NAMES = {
  none: 'Nenhum',
  results: 'Resultados',
  ranking: 'Classificação',
  queue: 'Próximas equipes'
};

/** What the audience is seeing right now, at a glance. */
class StatusIndicator extends BaseComponent {
  constructor() {
    super();
    this._state = { visible: false, team: null, panel: 'none', online: true };
  }

  connectedCallback() {
    this.render();
  }

  styles() {
    return `
      ${THEME}

      .box {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 18px 22px;
        border-radius: var(--radius);
        background: var(--surface-soft);
        border: 1px solid var(--surface-line);
        transition: border-color 400ms var(--ease-out), background 400ms var(--ease-out);
      }

      .box.live {
        border-color: rgba(248, 113, 113, 0.4);
        background: rgba(248, 113, 113, 0.07);
      }

      .beacon {
        position: relative;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--neutral);
        flex: none;
      }

      .box.live .beacon { background: var(--bad); }

      .box.live .beacon::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: var(--bad);
        animation: pulse-ring 2.4s var(--ease-out) infinite;
      }

      .main { flex: 1; min-width: 0; }

      .state {
        font-family: var(--font-display);
        font-size: 23px;
        font-weight: 700;
        letter-spacing: 0.14em;
        line-height: 1.1;
      }

      .box.live .state { color: var(--bad); }

      .team {
        font-size: 14px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .meta { text-align: right; }
      .meta .label { margin-bottom: 5px; }
      .meta .value { font-size: 14px; font-weight: 600; }

      .offline {
        color: var(--warn);
        font-size: 12px;
        font-weight: 600;
      }
    `;
  }

  template() {
    return `
      <div class="box" id="box">
        <span class="beacon"></span>
        <div class="main">
          <div class="state" id="state">FORA DO AR</div>
          <div class="team" id="team">Nenhuma equipe selecionada</div>
          <div class="offline" id="offline" style="display:none">Sem conexão com o servidor</div>
        </div>
        <div class="meta">
          <div class="label">Painel aberto</div>
          <div class="value" id="panel">Nenhum</div>
        </div>
      </div>
    `;
  }

  update() {
    const { visible, team, panel, online } = this._state;

    this.setClass('#box', 'live', visible);
    this.setText('#state', visible ? 'NO AR' : 'FORA DO AR');
    this.setText('#team', team ? `${team.name} — ${team.university}` : 'Nenhuma equipe selecionada');
    this.setText('#panel', PANEL_NAMES[panel] || panel);
    this.setStyleVar('#offline', 'display', online ? 'none' : 'block');
  }

  updateStatus(visible, team, panel) {
    this.setState({ visible, team, panel: panel || 'none' });
  }

  setOnline(online) {
    this.setState({ online });
  }
}

customElements.define('status-indicator', StatusIndicator);
export default StatusIndicator;
