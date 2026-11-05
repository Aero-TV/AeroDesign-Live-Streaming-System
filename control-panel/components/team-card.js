import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

/**
 * One selectable team in the operator's grid. Clicking puts it on air.
 *
 * Deliberately tiny: the whole field has to be visible at once, so the operator
 * never scrolls to find the team that is about to fly. That budget is what
 * decides the contents - photo, name, university, position, nothing else. The
 * stage lives on the Andamento board, which has room to show it properly.
 *
 * Name and university are ellipsized rather than wrapped, so every card is the
 * same height; the full text is on the card's title for hover.
 */
class TeamCard extends BaseComponent {
  constructor() {
    super();
    this._state = { teamData: null, active: false, ranking: null };
  }

  connectedCallback() {
    this.render();
  }

  renderKey() {
    return this._state.teamData ? this._state.teamData.id : 'empty';
  }

  styles() {
    return `
      ${THEME}

      :host { display: block; }

      .card {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        background: var(--surface-soft);
        border: 1px solid var(--surface-line);
        cursor: pointer;
        text-align: left;
        color: var(--text);
        font-family: var(--font-body);
        transition: transform 200ms var(--ease-out), background 240ms var(--ease-out),
                    border-color 240ms var(--ease-out);
      }

      .card:hover {
        transform: translateY(-2px);
        border-color: rgba(34, 211, 238, 0.4);
        background: rgba(34, 211, 238, 0.08);
      }

      .card:active { transform: translateY(0) scale(0.99); }

      /* The team currently on air. */
      .card.active {
        border-color: var(--accent);
        background: rgba(34, 211, 238, 0.14);
        box-shadow: 0 0 0 1px var(--accent) inset, 0 0 22px rgba(34, 211, 238, 0.16);
      }

      /* The position rides on the photo instead of taking a column of its own:
         horizontal space is what a 3-up grid has least of. */
      .pic { position: relative; flex: none; }

      .thumb {
        display: block;
        width: 34px;
        height: 34px;
        border-radius: 6px;
        object-fit: cover;
        background: rgba(255, 255, 255, 0.05);
      }

      .pos {
        position: absolute;
        right: -3px;
        bottom: -3px;
        min-width: 17px;
        padding: 0 3px;
        border-radius: 5px;
        background: var(--surface-strong);
        border: 1px solid rgba(34, 211, 238, 0.45);
        color: var(--accent);
        font-family: var(--font-display);
        font-size: 11px;
        font-weight: 700;
        line-height: 15px;
        text-align: center;
      }

      .info { flex: 1; min-width: 0; }

      /* Block-level, or the ellipsis never applies and the two lines collide. */
      .name, .uni {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .name { font-size: 12px; font-weight: 600; }

      .uni {
        font-size: 10px;
        color: var(--text-dim);
        margin-top: 1px;
      }
    `;
  }

  template() {
    const team = this._state.teamData;
    if (!team) return '<div></div>';

    const photo = team.aircraft_photo_url
      ? `../overlay/${team.aircraft_photo_url}`
      : '../overlay/assets/plane-photos/default.jpg';

    return `
      <button class="card" id="card" type="button">
        <span class="pic">
          <img class="thumb" src="${BaseComponent.escape(photo)}" alt="">
          <span class="pos" id="pos">--</span>
        </span>
        <span class="info">
          <span class="name" id="name"></span>
          <span class="uni" id="uni"></span>
        </span>
      </button>
    `;
  }

  afterRender() {
    const card = this.$('#card');
    if (!card) return;
    this.addManagedListener(card, 'click', () => {
      this.emit('team-selected', { teamId: this._state.teamData.id });
    });
  }

  update() {
    const { teamData, active, ranking } = this._state;
    if (!teamData) return;

    this.setText('#name', teamData.name);
    this.setText('#uni', teamData.university);
    this.setText('#pos', ranking ? ranking.position : '--');
    // The card is too small for the full names, so hover carries them.
    this.setAttr('#card', 'title', `${teamData.name} — ${teamData.university}`);
    this.setClass('#card', 'active', active);
  }

  setTeam(team) {
    this.setState({ teamData: team });
  }

  setActive(active) {
    this.setState({ active });
  }

  setRanking(ranking) {
    this.setState({ ranking });
  }
}

customElements.define('team-card', TeamCard);
export default TeamCard;
