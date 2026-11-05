import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

const STATUS_LABELS = {
  validated: 'Validado',
  invalidated: 'Invalidado',
  pending: 'Em andamento',
  not_flown: 'Não voou'
};

/**
 * Rows the compact standings panel shows.
 *
 * The limit lives here because this panel is what runs out of room: it is
 * anchored above the lower third, so every extra row grows it towards the top
 * of the frame. `build_ranking()` deliberately returns the whole field for the
 * full-screen board, and trimming there would starve the board instead.
 */
const RANKING_ROWS = 5;

const PANEL_TITLES = {
  results: 'Resultados das baterias',
  ranking: 'Classificação geral',
  queue: 'Próximas equipes'
};

/**
 * The panel that opens above the lower third on command.
 *
 * One component serves all three modes because they share the entrance, the
 * surface and the row rhythm - only the row contents differ. The active mode is
 * part of renderKey(), so switching modes replays the stagger instead of
 * swapping contents in place.
 */
class InfoPanel extends BaseComponent {
  constructor() {
    super();
    this._state = {
      panel: 'none',
      results: [],
      ranking: [],
      upcoming: [],
      currentTeamId: null
    };
  }

  connectedCallback() {
    this.render();
  }

  renderKey() {
    const { panel, results, ranking, upcoming } = this._state;
    const counts = {
      results: results.length,
      // The count actually drawn, so a team joining the field below the cut
      // does not rebuild the panel and replay its entrance on air.
      ranking: Math.min(ranking.length, RANKING_ROWS),
      queue: upcoming.length
    };
    return `${panel}-${counts[panel] || 0}-${this._state.currentTeamId || ''}`;
  }

  styles() {
    return `
      ${THEME}

      :host {
        position: absolute;
        left: 52px;
        /* Clears the lower third (64px offset + ~148px tall) with breathing
           room, so the card never covers this panel's bottom edge. */
        bottom: 236px;
        z-index: 790;
        opacity: 0;
        transform: translateY(26px) scale(0.98);
        transform-origin: bottom left;
        transition:
          opacity var(--exit) var(--ease-in),
          transform var(--exit) var(--ease-in);
        pointer-events: none;
      }

      :host(.is-visible) {
        opacity: 1;
        transform: translateY(0) scale(1);
        transition:
          opacity var(--enter) var(--ease-out),
          transform var(--enter) var(--ease-out);
      }

      .wrap {
        width: 660px;
        padding: 18px 22px 20px;
      }

      .head {
        display: flex;
        align-items: center;
        gap: 11px;
        padding-bottom: 13px;
        margin-bottom: 13px;
        border-bottom: 1px solid var(--surface-line);
        animation: rise-in 500ms var(--ease-out) both;
      }

      .head .mark {
        width: 4px;
        height: 17px;
        border-radius: 2px;
        background: var(--accent-gradient);
        box-shadow: 0 0 12px var(--accent-glow);
      }

      .title {
        font-family: var(--font-display);
        font-size: 21px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .rows { display: flex; flex-direction: column; gap: 7px; }

      .row {
        display: grid;
        align-items: center;
        gap: 13px;
        padding: 10px 13px;
        border-radius: var(--radius-sm);
        background: var(--surface-soft);
        border: 1px solid transparent;
        animation: slide-in-left 520ms var(--ease-out) both;
        animation-delay: calc(var(--i) * 65ms);
      }

      .row.results { grid-template-columns: 96px 132px 1fr 76px; }
      .row.ranking { grid-template-columns: 44px 1fr 96px 82px; }
      .row.queue   { grid-template-columns: 66px 1fr 82px; }

      /* The team on air is highlighted wherever it appears. */
      .row.active {
        border-color: rgba(34, 211, 238, 0.4);
        background: rgba(34, 211, 238, 0.09);
      }

      .cell-label {
        font-family: var(--font-display);
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }

      .name {
        font-size: 15px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .name small {
        display: block;
        font-size: 11px;
        color: var(--text-dim);
        font-weight: 400;
      }

      .value {
        font-family: var(--font-display);
        font-variant-numeric: tabular-nums;
        font-size: 21px;
        font-weight: 700;
        text-align: right;
      }

      .value small { font-size: 11px; color: var(--text-dim); font-weight: 400; }

      /* --- Status pills -------------------------------------------------- */
      .pill {
        display: inline-flex;
        /* Hug the text instead of stretching across the grid column. */
        justify-self: start;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .pill::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }

      .pill.validated   { color: var(--ok);      background: rgba(52, 211, 153, 0.13); }
      .pill.invalidated { color: var(--bad);     background: rgba(248, 113, 113, 0.13); }
      .pill.not_flown   { color: var(--neutral); background: rgba(100, 116, 139, 0.16); }

      /* The only continuously animated pill: a flight still in progress. */
      .pill.pending {
        color: var(--warn);
        background: rgba(251, 191, 36, 0.14);
        animation: breathe 2.8s ease-in-out infinite;
      }

      /* --- Podium tinting ------------------------------------------------ */
      .pos {
        font-family: var(--font-display);
        font-size: 23px;
        font-weight: 700;
        text-align: center;
      }

      .pos.p1 { color: #FCD34D; }
      .pos.p2 { color: #CBD5E1; }
      .pos.p3 { color: #D9A066; }

      .empty {
        padding: 16px 4px;
        font-size: 14px;
        color: var(--text-dim);
        text-align: center;
      }
    `;
  }

  resultsRows() {
    const results = this._state.results;
    if (!results.length) return '<div class="empty">Nenhum voo registrado ainda</div>';

    return results.map((r, i) => `
      <div class="row results" style="--i:${i}">
        <span class="cell-label">Bateria ${r.battery_number}</span>
        <span class="pill ${BaseComponent.escape(r.status)}">${STATUS_LABELS[r.status] || r.status}</span>
        <span class="value">${r.payload_kg != null ? r.payload_kg.toFixed(2) : '—'}<small> kg</small></span>
        <span class="value">${r.score != null ? r.score.toFixed(1) : '—'}</span>
      </div>
    `).join('');
  }

  rankingRows() {
    const { ranking, currentTeamId } = this._state;
    if (!ranking.length) return '<div class="empty">Classificação indisponível</div>';

    return ranking.slice(0, RANKING_ROWS).map((r, i) => `
      <div class="row ranking ${r.team_id === currentTeamId ? 'active' : ''}" style="--i:${i}">
        <span class="pos ${r.position <= 3 ? 'p' + r.position : ''}">${r.position}</span>
        <span class="name">${BaseComponent.escape(r.name)}<small>${BaseComponent.escape(r.university)}</small></span>
        <span class="value">${r.best_payload_kg != null ? r.best_payload_kg.toFixed(2) : '—'}<small> kg</small></span>
        <span class="value">${r.total_score.toFixed(1)}</span>
      </div>
    `).join('');
  }

  queueRows() {
    const upcoming = this._state.upcoming;
    if (!upcoming.length) return '<div class="empty">Fim da fila de voo</div>';

    return upcoming.map((t, i) => `
      <div class="row queue" style="--i:${i}">
        <span class="cell-label">${BaseComponent.escape(t.scheduled_time || '--:--')}</span>
        <span class="name">${BaseComponent.escape(t.name)}<small>${BaseComponent.escape(t.university)}</small></span>
        <span class="value">B${t.battery_number}</span>
      </div>
    `).join('');
  }

  template() {
    const panel = this._state.panel;
    if (panel === 'none') return '<div></div>';

    const rows = panel === 'results' ? this.resultsRows()
      : panel === 'ranking' ? this.rankingRows()
      : this.queueRows();

    return `
      <div class="wrap panel">
        <div class="head">
          <span class="mark"></span>
          <span class="title">${PANEL_TITLES[panel] || ''}</span>
        </div>
        <div class="rows">${rows}</div>
      </div>
    `;
  }

  show(panel, data) {
    this.setState({
      panel,
      results: data.results || [],
      ranking: data.ranking || [],
      upcoming: data.upcoming || [],
      currentTeamId: data.currentTeamId || null
    });
    this.setVisible(panel !== 'none');
  }

  hide() {
    this.setVisible(false);
  }
}

customElements.define('info-panel', InfoPanel);
export default InfoPanel;
