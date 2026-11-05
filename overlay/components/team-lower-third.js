import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';
import { stageLabel, stageTone, STAGE_STYLES } from '../../shared/stages.js';

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Below this many seconds the countdown escalates its styling. */
const WARN_AT = 60;
const CRITICAL_AT = 20;

/**
 * The team currently on air: photo, name, university, standing, battery and the
 * countdown to their takeoff window closing.
 *
 * The countdown is interpolated locally between API polls so it ticks smoothly
 * instead of stepping twice a second.
 */
class TeamLowerThird extends BaseComponent {
  constructor() {
    super();
    this._state = {
      team: null,
      ranking: null,
      stage: null,
      showBattery: true,
      showTimer: true,
      timer: null
    };
    this._timerSync = null;
    this._tickHandle = null;
  }

  connectedCallback() {
    this.render();
    this._tickHandle = setInterval(() => this.renderCountdown(), 200);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._tickHandle) clearInterval(this._tickHandle);
  }

  /** A new team means a fresh entrance animation, so it keys the structure. */
  renderKey() {
    return this._state.team ? `team-${this._state.team.id}` : 'empty';
  }

  styles() {
    return `
      ${THEME}

      :host {
        position: absolute;
        left: 52px;
        bottom: 64px;
        z-index: 800;
        opacity: 0;
        transform: translateX(-40px);
        transition:
          opacity var(--exit) var(--ease-in),
          transform var(--exit) var(--ease-in);
        pointer-events: none;
      }

      :host(.is-visible) {
        opacity: 1;
        transform: translateX(0);
        transition:
          opacity var(--enter) var(--ease-out),
          transform var(--enter) var(--ease-out);
      }

      .card {
        display: flex;
        align-items: stretch;
        min-width: 660px;
        max-width: 900px;
        padding: 20px 26px 20px 22px;
        gap: 22px;
      }

      .child {
        animation: slide-in-left var(--enter) var(--ease-out) both;
        animation-delay: calc(var(--i) * 90ms);
      }

      /* --- Aircraft photo ---------------------------------------------- */
      .photo-frame {
        position: relative;
        width: 108px;
        height: 108px;
        border-radius: var(--radius-sm);
        overflow: hidden;
        flex: none;
        background: var(--surface-soft);
        box-shadow: var(--shadow-tight);
      }

      .photo-frame::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: var(--radius-sm);
        border: 1px solid rgba(255, 255, 255, 0.14);
        /* Vignette keeps light photos from fighting the text next to them. */
        background: linear-gradient(160deg, transparent 45%, rgba(0, 0, 0, 0.45));
      }

      .photo {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transform: scale(1.08);
        transition: transform 1.4s var(--ease-out);
      }

      :host(.is-visible) .photo { transform: scale(1); }

      /* --- Identity ---------------------------------------------------- */
      .identity {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 7px;
        flex: 1;
        min-width: 0;
      }

      .eyebrow {
        display: flex;
        align-items: center;
        gap: 9px;
      }

      ${STAGE_STYLES}

      /* The eyebrow reports the stage, so it carries that stage's colour. */
      .eyebrow .bar {
        width: 26px;
        height: 2px;
        background: var(--tone, var(--accent));
        box-shadow: 0 0 10px var(--tone-glow, var(--accent-glow));
        animation: sweep-line 4.5s var(--ease-out) infinite;
      }

      .eyebrow .label { color: var(--tone, var(--text-dim)); }

      /* Only a stage that is happening in front of the camera pulses. */
      .eyebrow.tone-live .label {
        animation: breathe 2.6s ease-in-out infinite;
      }

      .team-name {
        font-family: var(--font-display);
        font-size: 46px;
        font-weight: 700;
        line-height: 0.94;
        letter-spacing: 0.005em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 2px 18px rgba(0, 0, 0, 0.5);
      }

      .university {
        font-size: 14px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .chips { display: flex; align-items: center; gap: 9px; margin-top: 4px; }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 5px 11px;
        border-radius: 999px;
        background: var(--surface-soft);
        border: 1px solid var(--surface-line);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        white-space: nowrap;
      }

      .chip b {
        font-family: var(--font-display);
        font-size: 16px;
        color: var(--text);
        font-weight: 700;
      }

      .chip.rank {
        border-color: rgba(34, 211, 238, 0.35);
        background: rgba(34, 211, 238, 0.1);
      }

      .chip.rank b { color: var(--accent); }

      /* Podium positions get the warmer treatment. */
      .chip.rank.podium {
        border-color: rgba(251, 191, 36, 0.45);
        background: rgba(251, 191, 36, 0.12);
      }

      .chip.rank.podium b { color: var(--warn); }

      /* --- Countdown ---------------------------------------------------- */
      .countdown {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding-left: 22px;
        border-left: 1px solid var(--surface-line);
        flex: none;
      }

      .ring-wrap { position: relative; width: 64px; height: 64px; }

      .ring { transform: rotate(-90deg); }

      .ring-track {
        fill: none;
        stroke: rgba(255, 255, 255, 0.1);
        stroke-width: 5;
      }

      .ring-value {
        fill: none;
        stroke: var(--accent);
        stroke-width: 5;
        stroke-linecap: round;
        stroke-dasharray: ${RING_CIRCUMFERENCE.toFixed(2)};
        /* Only the sweep is animated; colour changes are instant. */
        transition: stroke-dashoffset 300ms linear, stroke 500ms var(--ease-out);
        filter: drop-shadow(0 0 6px var(--accent-glow));
      }

      .ring-time {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-display);
        font-variant-numeric: tabular-nums;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      /* Escalation: cyan -> amber -> red, with a slow glow at the very end. */
      .countdown.warn .ring-value { stroke: var(--warn); filter: drop-shadow(0 0 7px var(--warn-glow)); }
      .countdown.warn .ring-time { color: var(--warn); }

      .countdown.critical .ring-value { stroke: var(--bad); filter: drop-shadow(0 0 8px var(--bad-glow)); }
      .countdown.critical .ring-time { color: var(--bad); }
      .countdown.critical .ring-wrap { border-radius: 50%; animation: urgent-glow 1.8s ease-in-out infinite; }

      .countdown.paused { opacity: 0.55; }
      .countdown.paused .ring-value { stroke: var(--neutral); filter: none; }

      .countdown.hidden { display: none; }
    `;
  }

  template() {
    const team = this._state.team;
    if (!team) return '<div></div>';

    const photo = team.aircraft_photo_url || 'assets/plane-photos/default.jpg';

    return `
      <div class="card panel">
        <div class="photo-frame child" style="--i:0">
          <img class="photo" id="photo" src="${BaseComponent.escape(photo)}" alt="">
        </div>

        <div class="identity">
          <div class="eyebrow child" id="eyebrow" style="--i:1">
            <span class="bar"></span>
            <span class="label" id="stageLabel"></span>
          </div>

          <div class="team-name child" id="teamName" style="--i:2"></div>
          <div class="university child" id="university" style="--i:3"></div>

          <div class="chips child" style="--i:4">
            <span class="chip rank" id="rankChip">
              <span>CLASSIFICAÇÃO</span><b id="rankValue">--</b>
            </span>
            <span class="chip" id="batteryChip">
              <span>BATERIA</span><b id="batteryValue">--</b>
            </span>
            <span class="chip" id="scoreChip">
              <span>TOTAL</span><b id="scoreValue">--</b>
            </span>
          </div>
        </div>

        <div class="countdown child" id="countdown" style="--i:5">
          <div class="ring-wrap">
            <svg class="ring" width="64" height="64" viewBox="0 0 64 64">
              <circle class="ring-track" cx="32" cy="32" r="${RING_RADIUS}"></circle>
              <circle class="ring-value" id="ringValue" cx="32" cy="32" r="${RING_RADIUS}"></circle>
            </svg>
            <div class="ring-time" id="ringTime">--:--</div>
          </div>
          <span class="label">Decolagem</span>
        </div>
      </div>
    `;
  }

  afterRender() {
    // A missing photo would otherwise render as a broken-image icon on air.
    const photo = this.$('#photo');
    if (!photo) return;

    this.addManagedListener(photo, 'error', () => {
      const fallback = 'assets/plane-photos/default.jpg';
      if (!photo.getAttribute('src').endsWith(fallback)) photo.src = fallback;
    });
  }

  update() {
    const { team, ranking, showBattery, showTimer } = this._state;
    if (!team) return;

    const stage = this._state.stage || team.stage;
    this.setText('#stageLabel', stageLabel(stage));

    // Swap the tone class rather than toggling each one individually.
    const eyebrow = this.$('#eyebrow');
    if (eyebrow) {
      const tone = `tone-${stageTone(stage)}`;
      if (!eyebrow.classList.contains(tone)) {
        eyebrow.className = `eyebrow child ${tone}`;
      }
    }

    this.setText('#teamName', team.name);
    this.setText('#university', team.university);
    this.setText('#batteryValue', team.current_battery);
    this.setStyleVar('#batteryChip', 'display', showBattery ? 'inline-flex' : 'none');

    if (ranking) {
      this.setText('#rankValue', `${ranking.position}º`);
      // One decimal everywhere, so the chip and the standings panel agree.
      this.setText('#scoreValue', ranking.total_score.toFixed(1));
      this.setClass('#rankChip', 'podium', ranking.position <= 3);
    } else {
      this.setText('#rankValue', '--');
      this.setText('#scoreValue', '--');
    }

    this.setStyleVar('#countdown', 'display', showTimer ? 'flex' : 'none');

    this.renderCountdown();
  }

  /**
   * Take a fresh reading from the API and note when it arrived, so the local
   * tick can extrapolate the elapsed time until the next poll lands.
   */
  syncTimer(timer) {
    if (!timer) return;
    this._timerSync = {
      remaining: timer.remaining_seconds,
      duration: timer.duration_seconds,
      running: timer.running,
      at: performance.now()
    };
  }

  currentRemaining() {
    if (!this._timerSync) return null;
    const { remaining, running, at } = this._timerSync;
    if (!running) return remaining;
    return Math.max(0, remaining - (performance.now() - at) / 1000);
  }

  renderCountdown() {
    const sync = this._timerSync;
    const remaining = this.currentRemaining();
    if (remaining === null || !this.$('#ringTime')) return;

    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    this.setText('#ringTime', `${minutes}:${String(seconds).padStart(2, '0')}`);

    const fraction = sync.duration > 0 ? remaining / sync.duration : 0;
    const ring = this.$('#ringValue');
    if (ring) {
      const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction)));
      ring.style.strokeDashoffset = offset.toFixed(2);
    }

    this.setClass('#countdown', 'warn', remaining <= WARN_AT && remaining > CRITICAL_AT);
    this.setClass('#countdown', 'critical', remaining <= CRITICAL_AT);
    this.setClass('#countdown', 'paused', !sync.running && remaining > 0);
  }

  show(team, options = {}) {
    this.setState({
      team,
      stage: options.stage || (team ? team.stage : null),
      ranking: options.ranking || null,
      showBattery: options.showBattery !== false,
      showTimer: options.showTimer !== false
    });
    if (options.timer) this.syncTimer(options.timer);
    this.setVisible(true);
  }

  hide() {
    this.setVisible(false);
  }
}

customElements.define('team-lower-third', TeamLowerThird);
export default TeamLowerThird;
