import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';
import {
  STAGE_ORDER, STAGE_FLOW, STAGE_BACK, stageLabel, stageTone, STAGE_STYLES
} from '../../shared/stages.js';

/**
 * Where every team is, at a glance.
 *
 * All stages are always listed, empty ones included and dimmed: the shape of
 * the pipeline is itself the information, and rows appearing and disappearing
 * would make the board jump around while the operator is reading it.
 *
 * Each chip carries its own two arrows - back on the left, forward on the
 * right - so a team is moved where the operator is already looking. The name
 * between them only selects, which keeps a misclick on a 11px chip from
 * changing a stage on air.
 */
class StageBoard extends BaseComponent {
  constructor() {
    super();
    this._state = { board: [], currentTeamId: null };
  }

  connectedCallback() {
    this.render();
  }

  /** Structure is fixed; only counts and names change. */
  renderKey() {
    return 'board';
  }

  styles() {
    return `
      ${THEME}
      ${STAGE_STYLES}

      .rows { display: flex; flex-direction: column; gap: 5px; }

      .row {
        display: grid;
        grid-template-columns: 9px 176px 1fr;
        align-items: center;
        gap: 11px;
        padding: 8px 11px;
        border-radius: var(--radius-sm);
        background: var(--surface-soft);
        border: 1px solid transparent;
        transition: opacity 300ms var(--ease-out), border-color 300ms var(--ease-out);
      }

      .row.empty { opacity: 0.34; }

      .row.occupied { border-color: color-mix(in srgb, var(--tone) 28%, transparent); }

      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--tone);
        box-shadow: 0 0 9px var(--tone-glow);
      }

      .row.tone-live.occupied .dot { animation: breathe 2.2s ease-in-out infinite; }

      .stage {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.03em;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .row.occupied .stage { color: var(--text); }

      .teams { display: flex; flex-wrap: wrap; gap: 5px; }

      .chip {
        display: flex;
        align-items: stretch;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--tone) 32%, transparent);
        background: color-mix(in srgb, var(--tone) 11%, transparent);
        overflow: hidden;
      }

      .chip button {
        border: 0;
        background: none;
        color: var(--text);
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: background 180ms var(--ease-out);
      }

      .name { padding: 3px 8px; }

      .name:hover { background: color-mix(in srgb, var(--tone) 24%, transparent); }

      /* Place in the line, so the operator can see who is next at a glance. */
      .name .pos {
        display: inline-block;
        margin-right: 4px;
        font-family: var(--font-display);
        font-size: 12px;
        color: var(--tone);
      }

      /* Wide enough to hit without aiming, on a control clicked mid-flight. */
      .arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 19px;
        padding: 0;
        color: var(--tone);
        font-size: 13px;
        line-height: 1;
      }

      .arrow:hover { background: color-mix(in srgb, var(--tone) 30%, transparent); }
      .arrow:active { background: color-mix(in srgb, var(--tone) 44%, transparent); }

      /* Nothing on the other side of the cycle: kept in place rather than
         hidden, so the chips do not change width as teams move. */
      .arrow:disabled {
        color: var(--text-dim);
        opacity: 0.35;
        cursor: default;
        background: none;
      }

      /* The team on air is marked wherever it appears. */
      .chip.on-air {
        border-color: var(--tone);
        box-shadow: 0 0 0 1px var(--tone) inset;
      }

      .none { font-size: 11px; color: var(--text-dim); }
    `;
  }

  template() {
    const rows = STAGE_ORDER.map((stage) => `
      <div class="row tone-${stageTone(stage)}" data-stage="${stage}">
        <span class="dot"></span>
        <span class="stage">${stageLabel(stage)}</span>
        <span class="teams" data-teams="${stage}"></span>
      </div>
    `).join('');

    return `<div class="rows">${rows}</div>`;
  }

  afterRender() {
    const rows = this.$('.rows');
    if (!rows) return;

    // Delegated: the chips are rebuilt as teams move, and binding each one
    // would leave listeners behind on detached nodes all event long.
    this.addManagedListener(rows, 'click', (event) => {
      const button = event.target.closest('.arrow, .name');
      if (!button) return;

      const { team, dir } = button.dataset;
      if (dir) this.emit('team-stage-step', { teamId: team, dir });
      else this.emit('team-selected', { teamId: team });
    });
  }

  update() {
    const { board, currentTeamId } = this._state;
    if (!board.length) return;

    const byStage = new Map(board.map((row) => [row.stage, row]));

    STAGE_ORDER.forEach((stage) => {
      const row = this.$(`.row[data-stage="${stage}"]`);
      const host = this.$(`[data-teams="${stage}"]`);
      if (!row || !host) return;

      const teams = (byStage.get(stage) || {}).teams || [];

      this.setClass(row, 'empty', teams.length === 0);
      this.setClass(row, 'occupied', teams.length > 0);

      // Rebuild the chips only when the membership actually changed, so hover
      // and the pulse are not reset on every poll.
      const signature = teams
        .map((t) => `${t.team_id}:${t.battery_number}:${t.queue_position || ''}`)
        .join('|') + `#${currentTeamId || ''}`;
      if (host.dataset.signature === signature) return;
      host.dataset.signature = signature;

      if (!teams.length) {
        host.innerHTML = '<span class="none">—</span>';
        return;
      }

      // Both targets are the row's own stage, so they are worked out once for
      // the whole row rather than per chip.
      const back = STAGE_BACK[stage];
      const forward = STAGE_FLOW[stage];

      host.innerHTML = teams.map((t) => {
        const id = BaseComponent.escape(t.team_id);
        return `
          <span class="chip ${t.team_id === currentTeamId ? 'on-air' : ''}">
            <button class="arrow" type="button" data-team="${id}" data-dir="back"
                    ${back ? `title="Voltar para ${stageLabel(back)}"` : 'disabled title="Início do ciclo"'}>←</button>
            <button class="name" type="button" data-team="${id}">
              ${t.queue_position ? `<b class="pos">${t.queue_position}º</b>` : ''}
              ${BaseComponent.escape(t.name)}
            </button>
            <button class="arrow" type="button" data-team="${id}" data-dir="fwd"
                    ${forward ? `title="Avançar para ${stageLabel(forward)}"` : 'disabled title="Bateria encerrada"'}>→</button>
          </span>
        `;
      }).join('');
    });
  }

  setBoard(board, currentTeamId) {
    this.setState({ board, currentTeamId });
  }
}

customElements.define('stage-board', StageBoard);
export default StageBoard;
