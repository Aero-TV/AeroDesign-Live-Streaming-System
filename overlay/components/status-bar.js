import BaseComponent from '../../shared/components/base-component.js';
import { THEME } from '../../shared/styles/theme.js';

const WEATHER_LABELS = {
  clear: 'Céu limpo',
  partly_cloudy: 'Parc. nublado',
  cloudy: 'Nublado',
  rain: 'Chuva',
  storm: 'Tempestade',
  wind: 'Ventos fortes'
};

/** Compact inline SVGs - no external icon font to fail on a field connection. */
const WEATHER_ICONS = {
  clear: `<circle cx="12" cy="12" r="5"/><g stroke-linecap="round"><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></g>`,
  partly_cloudy: `<circle cx="8" cy="8" r="3.4"/><path d="M8 1.5v2M2.4 8h-2M4 4l-1.4-1.4M12.5 4 14 2.6"/><path d="M7 19a4 4 0 0 1 .6-8 5.2 5.2 0 0 1 9.8 1.6A3.4 3.4 0 0 1 17 19z"/>`,
  cloudy: `<path d="M6.5 19a4.3 4.3 0 0 1 .7-8.6 5.6 5.6 0 0 1 10.6 1.7A3.6 3.6 0 0 1 17.5 19z"/>`,
  rain: `<path d="M6.5 15a4.3 4.3 0 0 1 .7-8.6 5.6 5.6 0 0 1 10.6 1.7A3.6 3.6 0 0 1 17.5 15z"/><g stroke-linecap="round"><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></g>`,
  storm: `<path d="M6.5 14a4.3 4.3 0 0 1 .7-8.6 5.6 5.6 0 0 1 10.6 1.7A3.6 3.6 0 0 1 17.5 14z"/><path d="M13 15l-3.5 4.5H12L10.5 23"/>`,
  wind: `<g stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h8"/></g>`
};

const CARDINALS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

/**
 * The persistent top bar: clock, current weather, short forecast and the
 * atmospheric numbers that decide how much payload an aircraft can lift.
 *
 * The clock runs off its own interval rather than the API poll, so it stays
 * smooth even if the network hiccups.
 */
class StatusBar extends BaseComponent {
  constructor() {
    super();
    // Assign directly rather than via setState: a custom element constructor
    // must not touch the DOM, and setState renders.
    this._state = { conditions: null, visible: false };
    this._clockTimer = null;
    this._lastDensityAltitude = null;
  }

  connectedCallback() {
    this.render();
    this._clockTimer = setInterval(() => this.updateClock(), 1000);
    this.updateClock();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._clockTimer) clearInterval(this._clockTimer);
  }

  /** Rebuild only when the forecast length changes; everything else patches. */
  renderKey() {
    const forecast = this.state?.conditions?.forecast;
    return `bar-${forecast ? forecast.length : 0}`;
  }

  get state() {
    return this._state;
  }

  styles() {
    return `
      ${THEME}

      :host {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 900;
        opacity: 0;
        transform: translateY(-100%);
        transition:
          opacity var(--exit) var(--ease-in),
          transform var(--exit) var(--ease-in);
        pointer-events: none;
      }

      :host(.is-visible) {
        opacity: 1;
        transform: translateY(0);
        transition:
          opacity var(--enter) var(--ease-out),
          transform var(--enter) var(--ease-out);
      }

      .bar {
        display: flex;
        align-items: stretch;
        gap: 0;
        height: 78px;
        margin: 22px 30px 0;
        padding: 0 6px 0 0;
        border-radius: var(--radius);
      }

      /* Each segment fades up in sequence, so the bar assembles left to right. */
      .seg {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 0 22px;
        position: relative;
        animation: rise-in var(--enter) var(--ease-out) both;
        animation-delay: calc(var(--i) * 70ms);
      }

      .seg + .seg::before {
        content: '';
        position: absolute;
        left: 0;
        top: 22%;
        bottom: 22%;
        width: 1px;
        background: var(--surface-line);
      }

      .seg.grow { flex: 1; }

      /* --- Live indicator --------------------------------------------- */
      .live {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .dot {
        position: relative;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--bad);
        flex: none;
      }

      .dot::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: var(--bad);
        animation: pulse-ring 2.6s var(--ease-out) infinite;
      }

      .live-text {
        font-family: var(--font-display);
        font-size: 19px;
        font-weight: 700;
        letter-spacing: 0.22em;
        color: var(--text);
      }

      .field-name {
        font-size: 12px;
        color: var(--text-muted);
        max-width: 320px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .stack { display: flex; flex-direction: column; gap: 5px; justify-content: center; }

      /* --- Clock ------------------------------------------------------- */
      .clock {
        font-family: var(--font-display);
        font-variant-numeric: tabular-nums;
        font-size: 40px;
        font-weight: 600;
        line-height: 0.9;
        letter-spacing: 0.02em;
      }

      .clock .sep {
        animation: breathe 2.4s ease-in-out infinite;
        color: var(--accent);
      }

      /*
       * Seconds are deliberately subordinate: at a similar size they merge
       * with the minutes and "19:25 04" reads as one number.
       */
      .clock .secs {
        font-size: 16px;
        font-weight: 500;
        color: var(--text-dim);
        margin-left: 7px;
        letter-spacing: 0.04em;
      }

      /* --- Weather ----------------------------------------------------- */
      .wx-icon {
        width: 34px;
        height: 34px;
        stroke: var(--accent);
        fill: none;
        stroke-width: 1.7;
        flex: none;
        filter: drop-shadow(0 0 9px var(--accent-glow));
      }

      .temp {
        font-family: var(--font-display);
        font-variant-numeric: tabular-nums;
        font-size: 38px;
        font-weight: 600;
        line-height: 0.9;
      }

      .temp .unit { font-size: 19px; color: var(--text-muted); }

      .wx-meta { font-size: 12px; color: var(--text-muted); white-space: nowrap; }

      /* A real glyph rotates crisply at any angle; a text arrow does not. */
      .wind-arrow {
        width: 13px;
        height: 13px;
        vertical-align: -1px;
        stroke: var(--accent);
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform 900ms var(--ease-out);
      }

      /* --- Forecast ---------------------------------------------------- */
      .forecast { display: flex; gap: 18px; align-items: center; }

      /*
       * Each forecast hour is laid out horizontally (icon beside a two-line
       * column) rather than stacked. A vertical stack of four elements does not
       * fit the bar height and clips both the section label and the rain
       * chance.
       */
      .fc {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 7px;
      }

      .fc svg {
        width: 20px;
        height: 20px;
        stroke: var(--text-muted);
        fill: none;
        stroke-width: 1.8;
        flex: none;
      }

      .fc-col { display: flex; flex-direction: column; gap: 1px; }

      .fc-hour {
        font-size: 10px;
        letter-spacing: 0.08em;
        color: var(--text-dim);
        white-space: nowrap;
      }

      .fc-hour i { font-style: normal; color: var(--accent); }

      .fc-temp {
        font-family: var(--font-display);
        font-size: 18px;
        font-weight: 600;
        line-height: 1;
      }

      /* --- Density altitude: the headline atmospheric number ----------- */
      .density {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .da-value {
        font-family: var(--font-display);
        font-variant-numeric: tabular-nums;
        font-size: 38px;
        font-weight: 700;
        line-height: 0.9;
        background: var(--accent-gradient);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .da-value.bump { animation: value-bump 700ms var(--ease-out); }

      .da-unit { font-size: 17px; color: var(--text-muted); }
      .da-ft { font-size: 11px; color: var(--text-dim); }

      /* Relative density meter: how much lift is on offer vs. sea level. */
      .meter {
        width: 96px;
        height: 5px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }

      .meter-fill {
        height: 100%;
        width: 0;
        border-radius: 3px;
        background: var(--accent-gradient);
        box-shadow: 0 0 12px var(--accent-glow);
        transition: width 1.1s var(--ease-out);
      }

      .rho { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
      .rho b { color: var(--text); font-weight: 600; }
    `;
  }

  icon(condition, className = 'wx-icon') {
    const paths = WEATHER_ICONS[condition] || WEATHER_ICONS.clear;
    return `<svg class="${className}" viewBox="0 0 24 24" stroke-linejoin="round">${paths}</svg>`;
  }

  template() {
    const conditions = this.state.conditions;
    const forecast = (conditions && conditions.forecast) || [];

    const forecastHtml = forecast.map((f) => `
      <div class="fc">
        ${this.icon(f.condition, '')}
        <div class="fc-col">
          <span class="fc-hour">
            ${BaseComponent.escape(f.label)}${f.precip_chance_pct > 0 ? ` <i>${f.precip_chance_pct}%</i>` : ''}
          </span>
          <span class="fc-temp">${Math.round(f.temperature_c)}°</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="bar panel">
        <div class="seg" style="--i:0">
          <div class="live">
            <span class="dot"></span>
            <div class="stack">
              <span class="live-text">AO VIVO</span>
              <span class="field-name" id="fieldName"></span>
            </div>
          </div>
        </div>

        <div class="seg" style="--i:1">
          <div class="stack">
            <span class="label">Horário</span>
            <span class="clock">
              <span id="hh">--</span><span class="sep">:</span><span id="mm">--</span><span class="secs" id="ss">--</span>
            </span>
          </div>
        </div>

        <div class="seg" style="--i:2">
          <span id="wxIcon">${this.icon(conditions ? conditions.condition : 'clear')}</span>
          <div class="stack">
            <span class="temp"><span id="temp">--</span><span class="unit">°C</span></span>
            <span class="wx-meta" id="wxCondition"></span>
          </div>
        </div>

        <div class="seg" style="--i:3">
          <div class="stack">
            <span class="label">Umidade / Vento</span>
            <span class="wx-meta">
              <span id="humidity">--</span>% ·
              <svg class="wind-arrow" id="windArrow" viewBox="0 0 24 24">
                <path d="M12 21V4M12 4l-6 6M12 4l6 6"/>
              </svg>
              <span id="wind">--</span> km/h <span id="windDir"></span>
            </span>
            <span class="wx-meta">QNH <span id="qnh">--</span> hPa · Orvalho <span id="dew">--</span>°C</span>
          </div>
        </div>

        <div class="seg grow" style="--i:4">
          <div class="stack">
            <span class="label">Previsão</span>
            <div class="forecast">${forecastHtml}</div>
          </div>
        </div>

        <div class="seg" style="--i:5">
          <div class="stack">
            <span class="label">Altitude-densidade</span>
            <div class="density">
              <div>
                <span class="da-value numeric" id="da">----</span><span class="da-unit"> m</span>
                <div class="da-ft"><span id="daFt">--</span> ft · campo <span id="elev">--</span> m</div>
              </div>
              <div class="stack">
                <span class="rho">Densidade <b><span id="rho">--</span></b> kg/m³</span>
                <div class="meter"><div class="meter-fill" id="meterFill"></div></div>
                <span class="rho"><span id="rhoPct">--</span>% do nível do mar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  updateClock() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    this.setText('#hh', pad(now.getHours()));
    this.setText('#mm', pad(now.getMinutes()));
    this.setText('#ss', pad(now.getSeconds()));
  }

  update() {
    const conditions = this.state.conditions;
    if (!conditions) return;

    const derived = conditions.derived || {};

    this.setText('#fieldName', conditions.field_name);
    this.setText('#temp', Math.round(conditions.temperature_c));
    this.setText('#wxCondition', WEATHER_LABELS[conditions.condition] || conditions.condition);
    this.setText('#humidity', Math.round(conditions.humidity_pct));
    this.setText('#wind', Math.round(conditions.wind_speed_kmh));
    this.setText('#windDir', this.cardinal(conditions.wind_direction_deg));
    this.setText('#qnh', Math.round(conditions.qnh_hpa));
    this.setText('#dew', derived.dew_point_c);
    this.setText('#elev', Math.round(conditions.field_elevation_m));
    this.setText('#rho', derived.air_density_kg_m3);
    this.setText('#rhoPct', derived.relative_density_pct);
    this.setText('#daFt', this.thousands(derived.density_altitude_ft));

    // The wind arrow points where the wind is going, not where it comes from.
    const arrow = this.$('#windArrow');
    if (arrow) {
      arrow.style.transform = `rotate(${(conditions.wind_direction_deg || 0) + 180}deg)`;
    }

    const iconHost = this.$('#wxIcon');
    if (iconHost && iconHost.dataset.condition !== conditions.condition) {
      iconHost.dataset.condition = conditions.condition;
      iconHost.innerHTML = this.icon(conditions.condition);
    }

    // Relative density drives the meter. Map 70-105% across the full bar so
    // realistic swings are visible instead of crowding one end.
    const pct = derived.relative_density_pct || 0;
    const fill = Math.max(0, Math.min(100, ((pct - 70) / 35) * 100));
    const meterFill = this.$('#meterFill');
    if (meterFill) meterFill.style.width = `${fill}%`;

    const da = derived.density_altitude_m;
    this.setText('#da', this.thousands(da));
    if (this._lastDensityAltitude !== null && da !== this._lastDensityAltitude) {
      this.bump('#da');
    }
    this._lastDensityAltitude = da;
  }

  /** Restart the change animation by forcing a reflow between class toggles. */
  bump(selector) {
    const el = this.$(selector);
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  cardinal(degrees) {
    if (degrees == null) return '';
    return CARDINALS[Math.round(((degrees % 360) / 45)) % 8];
  }

  thousands(value) {
    if (value == null) return '--';
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  show(conditions) {
    this.setState({ conditions, visible: true });
    this.setVisible(true);
  }

  hide() {
    this.setVisible(false);
  }
}

customElements.define('status-bar', StatusBar);
export default StatusBar;
