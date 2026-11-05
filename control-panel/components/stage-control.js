import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';
import {
  STAGE_ORDER, STAGE_FLOW, TERMINAL_STAGES,
  stageLabel, stageTone, STAGE_STYLES
} from '../../shared/stages.js';

/**
 * Drives the selected team through the competition cycle.
 *
 * The advance button follows the default path and is the action the operator
 * reaches for all day; the dropdown exists for the times the day does not
 * follow the path.
 */
class StageControl extends BaseComponent {
  constructor() {
    super();
    this._state = { team: null };
  }

  connectedCallback() {
    this.render();
  }

  renderKey() {
    return this._state.team ? `stage-${this._state.team.id}` : 'empty';
  }

  styles() {
    return `
      ${THEME}
      ${STAGE_STYLES}

      .empty {
        padding: 14px 2px;
        font-size: 13px;
        color: var(--text-dim);
        text-align: center;
      }

      .current {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 15px 18px;
        border-radius: var(--radius);
        background: var(--surface-soft);
        border: 1px solid var(--surface-line);
        margin-bottom: 14px;
        transition: border-color 400ms var(--ease-out);
      }

      .current { border-color: color-mix(in srgb, var(--tone) 40%, transparent); }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--tone);
        box-shadow: 0 0 12px var(--tone-glow);
        flex: none;
      }

      /* Only the stages happening in front of the camera pulse. */
      .current.tone-live .dot { animation: breathe 2.2s ease-in-out infinite; }

      .current-text { flex: 1; min-width: 0; }

      .stage-name {
        font-family: var(--font-display);
        font-size: 21px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--tone);
        line-height: 1.1;
      }

      .team-name {
        font-size: 12px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .battery {
        font-family: var(--font-display);
        font-size: 13px;
        font-weight: 700;
        color: var(--text-muted);
        white-space: nowrap;
        flex: none;
      }

      button {
        width: 100%;
        padding: 14px 16px;
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

      button:hover:not(:disabled) {
        background: rgba(34, 211, 238, 0.1);
        border-color: rgba(34, 211, 238, 0.4);
      }

      button:active:not(:disabled) { transform: scale(0.98); }

      button:disabled { opacity: 0.4; cursor: not-allowed; }

      #advance {
        background: var(--accent-gradient);
        border-color: transparent;
        color: #05121C;
        font-weight: 700;
      }

      #advance:hover:not(:disabled) { filter: brightness(1.08); }

      #nextBattery {
        border-color: rgba(52, 211, 153, 0.35);
        background: rgba(52, 211, 153, 0.1);
        margin-top: 9px;
      }

      #nextBattery:hover:not(:disabled) {
        background: rgba(52, 211, 153, 0.18);
        border-color: var(--ok);
      }

      .field { display: flex; flex-direction: column; gap: 6px; }

      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0 12px; }

      label.label { display: block; margin-bottom: 6px; }

      input, select {
        width: 100%;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--surface-line);
        background: rgba(255, 255, 255, 0.04);
        color: var(--text);
        font-family: var(--font-body);
        font-size: 13px;
      }

      input:focus, select:focus {
        outline: none;
        border-color: var(--accent);
        background: rgba(34, 211, 238, 0.07);
      }

      select option { background: #0d1524; }

      .jump { margin-top: 12px; }

      .hint { font-size: 11px; color: var(--text-dim); margin-top: 8px; line-height: 1.5; }
    `;
  }

  template() {
    if (!this._state.team) {
      return '<div class="empty">Selecione uma equipe para controlar o estágio</div>';
    }

    const options = STAGE_ORDER
      .map((s) => `<option value="${s}">${stageLabel(s)}</option>`)
      .join('');

    return `
      <div>
        <div class="current" id="current">
          <span class="dot"></span>
          <span class="current-text">
            <span class="stage-name" id="stageName"></span>
            <span class="team-name" id="teamName"></span>
          </span>
          <span class="battery">
            <span id="linePos"></span>BAT <span id="battery"></span>
          </span>
        </div>

        <button id="advance" type="button"></button>
        <button id="nextBattery" type="button">Iniciar próxima bateria</button>

        <div class="row">
          <div class="field">
            <label class="label" for="score">Nota</label>
            <input type="number" id="score" step="0.1" placeholder="—">
          </div>
          <div class="field">
            <label class="label" for="payload">Carga (kg)</label>
            <input type="number" id="payload" step="0.01" placeholder="—">
          </div>
        </div>
        <p class="hint">
          Usados ao validar a bateria. A validação já grava o resultado — não
          precisa lançar em outro lugar.
        </p>

        <div class="jump">
          <label class="label" for="jump">Mover direto para</label>
          <select id="jump">${options}</select>
        </div>
      </div>
    `;
  }

  /** Score and payload only mean anything on the transitions that record them. */
  readResult() {
    const score = parseFloat(this.$('#score')?.value);
    const payload = parseFloat(this.$('#payload')?.value);
    return {
      score: Number.isNaN(score) ? null : score,
      payload_kg: Number.isNaN(payload) ? null : payload
    };
  }

  afterRender() {
    const advance = this.$('#advance');
    if (!advance) return;

    this.addManagedListener(advance, 'click', () => {
      this.emit('stage-advance', this.readResult());
    });

    this.addManagedListener(this.$('#nextBattery'), 'click', () => {
      this.emit('stage-next-battery');
    });

    this.addManagedListener(this.$('#jump'), 'change', (event) => {
      this.emit('stage-set', { stage: event.target.value, ...this.readResult() });
    });
  }

  update() {
    const team = this._state.team;
    if (!team || !this.$('#stageName')) return;

    const stage = team.stage;
    const next = STAGE_FLOW[stage];
    const terminal = TERMINAL_STAGES.includes(stage);

    this.setText('#stageName', stageLabel(stage));
    this.setText('#teamName', team.name);
    this.setText('#battery', team.current_battery);
    // Only queued teams hold a place in the line.
    this.setText('#linePos', team.queue_position ? `${team.queue_position}º NA FILA · ` : '');

    const current = this.$('#current');
    const tone = `tone-${stageTone(stage)}`;
    if (current && !current.classList.contains(tone)) {
      current.className = `current ${tone}`;
    }

    this.setText('#advance', next ? `Avançar → ${stageLabel(next)}` : 'Bateria concluída');
    this.setAttr('#advance', 'disabled', !next);
    this.setAttr('#nextBattery', 'disabled', !terminal);

    // Keep the dropdown showing where the team actually is, but never fight the
    // operator while the menu is open.
    const jump = this.$('#jump');
    if (jump && document.activeElement !== this && jump.value !== stage) {
      jump.value = stage;
    }
  }

  setTeam(team) {
    this.setState({ team });
  }
}

customElements.define('stage-control', StageControl);
export default StageControl;
