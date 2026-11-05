import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

/** Cascade step between rows, so the board sets line by line. */
const STEP_MS = 45;

/**
 * Lead before a row's flaps start turning. Slightly longer than the 460ms row
 * entrance, so each line has settled before its number moves.
 */
const FLIP_LEAD_MS = 480;

/** How long one flap holds the frame before the next one drops. */
const SLOT_MS = 150;

/** Wrong numbers a debuting row riffles through before the real one lands. */
const RIFFLE_STEPS = 2;

/**
 * The full-screen standings, set like an airport departures board.
 *
 * Every row carries `previous_position` from the API - the team's place as of
 * the last time this board came down - and that is what decides how its
 * position flap behaves:
 *
 *   moved     - one flip, old number folding away as the new one drops in.
 *   unchanged - nothing turns. This is what makes the movers readable.
 *   no previous value (first showing, or a team new to the standings) - the
 *               flap riffles: blank card, a couple of wrong numbers, then the
 *               real one. A single flip out of nothing would read as a glitch,
 *               but a riffle reads as the board setting a line it never held.
 *
 * Every flap, whichever case, occupies one SLOT_MS frame indexed by --k, so
 * the three cases share one delay formula in CSS.
 *
 * The animation lives in template(), not update(), so it plays once when the
 * board opens rather than restarting on every poll. renderKey() therefore
 * tracks the position moves; scores that merely tick are patched in update().
 */
class StandingsBoard extends BaseComponent {
  constructor() {
    super();
    this._state = { ranking: [] };
  }

  connectedCallback() {
    this.render();
  }

  /** The set of moves is the board's identity: same moves, same flips. */
  renderKey() {
    return this._state.ranking
      .map((r) => `${r.team_id}:${r.previous_position ?? '-'}>${r.position}`)
      .join('|') || 'empty';
  }

  styles() {
    return `
      ${THEME}

      :host {
        position: absolute;
        inset: 0;
        /* Under the top bar (900) so the clock and weather stay on air. */
        z-index: 850;
        opacity: 0;
        transition: opacity var(--exit) var(--ease-in);
        pointer-events: none;
      }

      :host(.is-visible) {
        opacity: 1;
        transition: opacity var(--enter) var(--ease-out);
      }

      /* The board takes the shot over, so the video behind it is dimmed rather
         than left competing with 20 rows of small type. */
      .scrim {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(1400px 800px at 50% 0%, rgba(46, 127, 240, 0.16), transparent 70%),
          rgba(4, 8, 16, 0.72);
        backdrop-filter: blur(calc(var(--blur) * 1.4)) saturate(1.2);
        -webkit-backdrop-filter: blur(calc(var(--blur) * 1.4)) saturate(1.2);
      }

      /* Dead centre of the frame, 60% of its width and 72% of its height. */
      .sheet {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60%;
        height: 72%;
        padding: 22px 26px 24px;
        display: flex;
        flex-direction: column;
      }

      .head {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 14px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--surface-line);
        animation: rise-in 560ms var(--ease-out) both;
      }

      .head .mark {
        width: 5px;
        height: 34px;
        border-radius: 2px;
        background: var(--accent-gradient);
        box-shadow: 0 0 16px var(--accent-glow);
      }

      .title {
        font-family: var(--font-display);
        font-size: 34px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        line-height: 1;
      }

      .subtitle {
        margin-left: auto;
        font-size: 13px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-dim);
      }

      .cols {
        display: grid;
        flex: 0 0 auto;
        gap: 14px;
        padding: 11px 14px 7px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-dim);
        animation: rise-in 560ms var(--ease-out) both;
        animation-delay: 90ms;
      }

      /* The rows share out whatever height is left, so the board fills its
         80% exactly whether the field is 20 teams or 12. */
      .rows {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
        gap: 4px;
      }

      .row {
        display: grid;
        flex: 1;
        min-height: 0;
        gap: 14px;
        align-items: center;
        padding: 3px 14px;
        border-radius: var(--radius-sm);
        background: var(--surface-soft);
        border: 1px solid transparent;
        animation: rise-in 460ms var(--ease-out) both;
        animation-delay: calc(var(--i) * ${STEP_MS}ms);
      }

      /* A row with no position to flip from sets its whole line: the text
         cells drop in column by column while the number is still riffling. */
      .row.setting { perspective: 320px; }

      .row.setting .flap-text {
        transform-origin: top center;
        backface-visibility: hidden;
        animation: flap-down 260ms var(--ease-out) both;
        animation-delay: calc(var(--d) + var(--c) * 70ms);
      }

      /* Proportional, so the columns hold together at 60% of any frame. */
      .cols, .row { grid-template-columns: 54px 1.3fr 1fr 118px 100px; }

      .row.active {
        border-color: rgba(34, 211, 238, 0.4);
        background: rgba(34, 211, 238, 0.09);
      }

      .name {
        font-size: 16px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .university {
        font-size: 13px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .value {
        font-family: var(--font-display);
        font-variant-numeric: tabular-nums;
        font-size: 20px;
        font-weight: 700;
        text-align: right;
      }

      .value small { font-size: 12px; color: var(--text-dim); font-weight: 400; }

      /* --- The flap ------------------------------------------------------- */
      /*
       * The flap takes the height the row was given rather than a fixed one:
       * a fixed height taller than the row's share is what the rows are
       * dividing, so 20 of them would add up past the sheet and the last
       * places would sit outside it. Stretching keeps the board inside its
       * share at any height.
       */
      .pos {
        position: relative;
        align-self: stretch;
        font-family: var(--font-display);
        font-variant-numeric: tabular-nums;
        font-size: 21px;
        font-weight: 700;
        perspective: 300px;
      }

      .pos.p1 { color: #FCD34D; }
      .pos.p2 { color: #CBD5E1; }
      .pos.p3 { color: #D9A066; }

      /* Centred by flex now that the flap has no fixed height for a
         line-height to match. */
      .face {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        backface-visibility: hidden;
        border-radius: 4px;
        background: rgba(8, 12, 22, 0.85);
      }

      /* The hinge the halves fold around. */
      .pos.turning::after {
        content: '';
        position: absolute;
        left: 8px;
        right: 8px;
        top: 50%;
        height: 1px;
        background: rgba(0, 0, 0, 0.55);
        z-index: 2;
      }

      /*
       * Only a turning flap animates - an unchanged position holds still,
       * which is what makes the movers readable. Each face owns the slot
       * --k, so a single flip (hold, new) and a riffle (hold, cycle, cycle,
       * new) run off the same formula.
       */
      .pos.turning .face {
        animation-delay: calc(var(--d) + var(--k) * ${SLOT_MS}ms);
      }

      /* The value on show when the board opens: it only has to leave. */
      .pos.turning .face.hold {
        transform-origin: bottom center;
        animation-name: flap-away;
        animation-duration: 170ms;
        animation-timing-function: var(--ease-in);
        animation-fill-mode: both;
      }

      /* A wrong number in passing: drops in, holds a beat, folds away. */
      .pos.turning .face.cycle {
        transform-origin: top center;
        animation-name: flap-cycle;
        animation-duration: 210ms;
        animation-timing-function: linear;
        animation-fill-mode: both;
      }

      /* The real number: drops in and stays. */
      .pos.turning .face.new {
        transform-origin: top center;
        animation-name: flap-down;
        animation-duration: 230ms;
        animation-timing-function: var(--ease-out);
        animation-fill-mode: both;
      }

      @keyframes flap-away {
        from { transform: rotateX(0deg);   opacity: 1; }
        to   { transform: rotateX(-92deg); opacity: 0; }
      }

      @keyframes flap-down {
        from { transform: rotateX(92deg); opacity: 0; }
        to   { transform: rotateX(0deg);  opacity: 1; }
      }

      @keyframes flap-cycle {
        0%   { transform: rotateX(92deg);  opacity: 0; }
        30%  { transform: rotateX(0deg);   opacity: 1; }
        70%  { transform: rotateX(0deg);   opacity: 1; }
        100% { transform: rotateX(-92deg); opacity: 0; }
      }

      .empty {
        padding: 40px 4px;
        font-size: 18px;
        color: var(--text-dim);
        text-align: center;
      }
    `;
  }

  positionCell(row) {
    const podium = row.position <= 3 ? ` p${row.position}` : '';

    if (row.previous_position == null) {
      // Decoys derived from the position rather than random, so a re-render
      // riffles through the same numbers instead of jumping.
      const decoys = Array.from({ length: RIFFLE_STEPS }, (_, j) =>
        `<span class="face cycle" style="--k:${j + 1}">${(row.position + (j + 1) * 7) % 20 + 1}</span>`
      ).join('');

      return `
        <span class="pos turning${podium}">
          <span class="face hold" style="--k:0"></span>
          ${decoys}
          <span class="face new" style="--k:${RIFFLE_STEPS + 1}">${row.position}</span>
        </span>
      `;
    }

    if (row.previous_position === row.position) {
      return `<span class="pos${podium}"><span class="face new">${row.position}</span></span>`;
    }

    return `
      <span class="pos turning${podium}">
        <span class="face hold" style="--k:0">${row.previous_position}</span>
        <span class="face new" style="--k:1">${row.position}</span>
      </span>
    `;
  }

  template() {
    const { ranking, currentTeamId } = this._state;

    if (!ranking.length) {
      return '<div class="scrim"></div><div class="sheet panel"><div class="empty">Classificação indisponível</div></div>';
    }

    const rows = ranking.map((r, i) => `
      <div class="row ${r.previous_position == null ? 'setting' : ''} ${r.team_id === currentTeamId ? 'active' : ''}"
           data-team="${BaseComponent.escape(r.team_id)}"
           style="--i:${i}; --d:${FLIP_LEAD_MS + i * STEP_MS}ms">
        ${this.positionCell(r)}
        <span class="name flap-text" style="--c:1">${BaseComponent.escape(r.name)}</span>
        <span class="university flap-text" style="--c:2">${BaseComponent.escape(r.university)}</span>
        <span class="value payload flap-text" style="--c:3"></span>
        <span class="value score flap-text" style="--c:4"></span>
      </div>
    `).join('');

    return `
      <div class="scrim"></div>
      <div class="sheet panel">
        <div class="head">
          <span class="mark"></span>
          <span class="title">Classificação geral</span>
          <span class="subtitle">${ranking.length} equipes · voos validados</span>
        </div>
        <div class="cols">
          <span>Pos</span>
          <span>Equipe</span>
          <span>Universidade</span>
          <span style="text-align:right">Melhor carga</span>
          <span style="text-align:right">Pontos</span>
        </div>
        <div class="rows">${rows}</div>
      </div>
    `;
  }

  /** Scores tick without the standings moving, so they are patched, not rebuilt. */
  update() {
    this._state.ranking.forEach((r) => {
      const row = this.$(`.row[data-team="${r.team_id}"]`);
      if (!row) return;
      this.setText(row.querySelector('.score'), r.total_score.toFixed(1));
      this.setText(
        row.querySelector('.payload'),
        r.best_payload_kg != null ? `${r.best_payload_kg.toFixed(2)} kg` : '—'
      );
    });
  }

  show(ranking, currentTeamId = null) {
    this.setState({ ranking: ranking || [], currentTeamId });
    this.setVisible(true);
  }

  hide() {
    this.setVisible(false);
  }
}

customElements.define('standings-board', StandingsBoard);
export default StandingsBoard;
