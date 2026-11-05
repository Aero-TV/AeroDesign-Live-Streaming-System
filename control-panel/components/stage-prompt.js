import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';
import { stageLabel, stageTone, STAGE_STYLES } from '../../shared/stages.js';

/**
 * Asks what became of the team being pushed out of an exclusive stage.
 *
 * Only one team can be on the runway or in the air, so putting a team there
 * ends the incumbent's turn. Only the operator knows how that flight went, and
 * the answer is written to a real team's battery, so it is asked rather than
 * assumed.
 */
class StagePrompt extends BaseComponent {
  constructor() {
    super();
    this._state = { open: false, request: null };
  }

  connectedCallback() {
    this.render();
  }

  renderKey() {
    const request = this._state.request;
    return request ? `${request.occupant_team_id}-${request.options.join()}` : 'empty';
  }

  styles() {
    return `
      ${THEME}
      ${STAGE_STYLES}

      :host {
        position: fixed;
        inset: 0;
        z-index: 6000;
        display: none;
        align-items: center;
        justify-content: center;
      }

      :host(.open) { display: flex; }

      .scrim {
        position: absolute;
        inset: 0;
        background: rgba(3, 6, 12, 0.72);
        backdrop-filter: blur(3px);
        animation: fade-in 220ms var(--ease-out) both;
      }

      @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

      .dialog {
        position: relative;
        width: min(480px, calc(100vw - 48px));
        padding: 26px 28px 24px;
        border-radius: var(--radius);
        background: var(--surface-strong);
        border: 1px solid var(--surface-line);
        box-shadow: var(--shadow);
        animation: rise-in 320ms var(--ease-out) both;
      }

      h3 {
        font-family: var(--font-display);
        font-size: 23px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        margin-bottom: 9px;
      }

      p {
        font-size: 14px;
        color: var(--text-muted);
        line-height: 1.55;
        margin-bottom: 20px;
      }

      p b { color: var(--text); font-weight: 600; }

      .options { display: flex; flex-direction: column; gap: 9px; }

      button {
        display: flex;
        align-items: center;
        gap: 11px;
        width: 100%;
        padding: 14px 16px;
        border-radius: var(--radius-sm);
        border: 1px solid color-mix(in srgb, var(--tone) 35%, transparent);
        background: color-mix(in srgb, var(--tone) 10%, transparent);
        color: var(--text);
        font-family: var(--font-body);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
        transition: transform 160ms var(--ease-out), background 200ms var(--ease-out);
      }

      button:hover { background: color-mix(in srgb, var(--tone) 22%, transparent); }
      button:active { transform: scale(0.985); }

      button .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--tone);
        box-shadow: 0 0 9px var(--tone-glow);
        flex: none;
      }

      .cancel {
        margin-top: 14px;
        width: 100%;
        padding: 11px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--surface-line);
        background: transparent;
        color: var(--text-muted);
        font-family: var(--font-body);
        font-size: 13px;
        cursor: pointer;
      }

      .cancel:hover { color: var(--text); }
    `;
  }

  template() {
    const request = this._state.request;
    if (!request) return '<div></div>';

    const buttons = request.options.map((option) => `
      <button type="button" class="tone-${stageTone(option)}" data-stage="${option}">
        <span class="dot"></span>
        <span>${stageLabel(option)}</span>
      </button>
    `).join('');

    const leavingAir = request.stage === 'flying';

    return `
      <div class="scrim" id="scrim"></div>
      <div class="dialog">
        <h3>${leavingAir ? 'Como terminou o voo?' : 'E a equipe na pista?'}</h3>
        <p>
          Só uma equipe pode estar <b id="stageName"></b>.
          Para liberar a posição, para onde vai <b id="occupant"></b>?
        </p>
        <div class="options">${buttons}</div>
        <button class="cancel" id="cancel" type="button">Cancelar</button>
      </div>
    `;
  }

  afterRender() {
    const cancel = this.$('#cancel');
    if (!cancel) return;

    this.addManagedListener(cancel, 'click', () => this.close());
    this.addManagedListener(this.$('#scrim'), 'click', () => this.close());

    this.$$('.options button').forEach((button) => {
      this.addManagedListener(button, 'click', () => {
        const stage = button.dataset.stage;
        this.close();
        this.emit('displacement-chosen', { stage });
      });
    });
  }

  update() {
    const request = this._state.request;
    if (!request || !this.$('#occupant')) return;

    this.setText('#occupant', request.occupant_name);
    this.setText('#stageName', stageLabel(request.stage).toLowerCase());
  }

  /** `request` is the 409 detail the backend returned. */
  ask(request) {
    this.setState({ request, open: true });
    this.classList.add('open');
  }

  close() {
    this.classList.remove('open');
    this.setState({ open: false });
  }
}

customElements.define('stage-prompt', StagePrompt);
export default StagePrompt;
