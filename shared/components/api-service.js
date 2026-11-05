/**
 * Single point of contact with the backend.
 *
 * The base URL is resolved rather than hardcoded, so the overlay works when OBS
 * runs on a different machine than the API - the common setup at a competition,
 * where the operator's laptop is not the one serving the page. Resolution order:
 *
 *   1. ?api=http://host:port  on the page URL
 *   2. <api-service base="http://host:port">
 *   3. the origin the page was served from
 *   4. http://localhost:8000   (file:// fallback)
 */
class ApiService extends HTMLElement {
  constructor() {
    super();
    this.pollInterval = null;
    this.pollRate = 500;
    this.online = null;
    this.consecutiveFailures = 0;
  }

  resolveBase() {
    const fromQuery = new URLSearchParams(window.location.search).get('api');
    if (fromQuery) return fromQuery.replace(/\/$/, '');

    const fromAttr = this.getAttribute('base');
    if (fromAttr) return fromAttr.replace(/\/$/, '');

    if (window.location.protocol === 'file:') return 'http://localhost:8000';

    return window.location.origin;
  }

  connectedCallback() {
    this.apiBase = `${this.resolveBase()}/api`;

    if (this.hasAttribute('poll-rate')) {
      const rate = parseInt(this.getAttribute('poll-rate'), 10);
      if (!Number.isNaN(rate) && rate >= 100) this.pollRate = rate;
    }

    window.aeroApi = {
      base: this.apiBase,
      getTeams: () => this.getTeams(),
      getTeam: (id) => this.getTeam(id),
      getOverlayState: () => this.getOverlayState(),
      updateOverlayState: (state) => this.updateOverlayState(state),
      showOverlay: (teamId) => this.showOverlay(teamId),
      hideOverlay: () => this.hideOverlay(),
      toggleOverlay: () => this.toggleOverlay(),
      setPanel: (panel) => this.setPanel(panel),
      updateTeam: (teamId, data) => this.updateTeam(teamId, data),
      updateCurrentBattery: (teamId, n) => this.updateCurrentBattery(teamId, n),
      addFlightResult: (teamId, result) => this.addFlightResult(teamId, result),
      getConditions: () => this.getConditions(),
      updateConditions: (data) => this.updateConditions(data),
      getRanking: (limit) => this.getRanking(limit),
      getStages: () => this.getStages(),
      setStage: (id, stage, score, payload, displaced) =>
        this.setStage(id, stage, score, payload, displaced),
      advanceStage: (id, score, payload, displaced) =>
        this.advanceStage(id, score, payload, displaced),
      nextBattery: (id) => this.nextBattery(id),
      getQueue: () => this.getQueue(),
      replaceQueue: (entries) => this.replaceQueue(entries),
      advanceQueue: () => this.advanceQueue(),
      getTimer: () => this.getTimer(),
      startTimer: () => this.startTimer(),
      pauseTimer: () => this.pauseTimer(),
      resetTimer: (seconds) => this.resetTimer(seconds),
      setTimerDuration: (seconds) => this.setTimerDuration(seconds)
    };

    if (this.hasAttribute('auto-poll')) {
      this.startPolling();
    }
  }

  disconnectedCallback() {
    this.stopPolling();
  }

  // --- Polling -------------------------------------------------------------

  startPolling() {
    if (this.pollInterval) return;
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), this.pollRate);
  }

  async poll() {
    try {
      const state = await this.getOverlayState();
      this.setOnline(true);
      this.dispatchEvent(new CustomEvent('state-updated', {
        detail: state,
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      // A dropped frame of data is normal on a busy network. Only report the
      // connection as lost after a few misses in a row, so the overlay does not
      // flicker a warning every time one request times out.
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= 3) this.setOnline(false);
    }
  }

  setOnline(isOnline) {
    if (isOnline) this.consecutiveFailures = 0;
    if (this.online === isOnline) return;
    this.online = isOnline;
    this.dispatchEvent(new CustomEvent('connection-changed', {
      detail: { online: isOnline },
      bubbles: true,
      composed: true
    }));
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // --- Request helpers -----------------------------------------------------

  async request(path, options = {}) {
    const response = await fetch(`${this.apiBase}${path}`, options);

    if (!response.ok) {
      // Carry the status and body along. Some refusals are not failures but
      // questions - an occupied exclusive stage asks the operator what became
      // of the team being pushed out - and the caller needs the detail to ask.
      const error = new Error(
        `${options.method || 'GET'} ${path} failed: ${response.status}`
      );
      error.status = response.status;
      error.detail = await response.json().then((b) => b.detail).catch(() => null);
      throw error;
    }

    return response.json();
  }

  post(path) {
    return this.request(path, { method: 'POST' });
  }

  sendJson(path, method, body) {
    return this.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  // --- Overlay -------------------------------------------------------------

  getOverlayState() {
    return this.request('/overlay/state');
  }

  updateOverlayState(state) {
    return this.sendJson('/overlay/state', 'PUT', state);
  }

  showOverlay(teamId = null) {
    return this.post(teamId ? `/overlay/show?team_id=${encodeURIComponent(teamId)}` : '/overlay/show');
  }

  hideOverlay() {
    return this.post('/overlay/hide');
  }

  toggleOverlay() {
    return this.post('/overlay/toggle');
  }

  setPanel(panel) {
    return this.post(`/overlay/panel?panel=${encodeURIComponent(panel)}`);
  }

  // --- Teams ---------------------------------------------------------------

  getTeams() {
    return this.request('/teams');
  }

  getTeam(teamId) {
    return this.request(`/teams/${encodeURIComponent(teamId)}`);
  }

  updateTeam(teamId, teamData) {
    return this.sendJson(`/teams/${encodeURIComponent(teamId)}`, 'PUT', teamData);
  }

  updateCurrentBattery(teamId, batteryNumber) {
    return this.request(
      `/teams/${encodeURIComponent(teamId)}/battery?battery_number=${batteryNumber}`,
      { method: 'PUT' }
    );
  }

  addFlightResult(teamId, result) {
    return this.sendJson(`/teams/${encodeURIComponent(teamId)}/results`, 'POST', result);
  }

  // --- Conditions, ranking, queue, timer -----------------------------------

  getConditions() {
    return this.request('/conditions');
  }

  updateConditions(data) {
    return this.sendJson('/conditions', 'PUT', data);
  }

  getRanking(limit) {
    return this.request(limit ? `/ranking?limit=${limit}` : '/ranking');
  }

  // --- Team stage ----------------------------------------------------------

  getStages() {
    return this.request('/stages');
  }

  /** Score and payload are only meaningful on the transitions that record them. */
  resultQuery(score, payload) {
    const parts = [];
    if (score !== null && score !== undefined) parts.push(`score=${score}`);
    if (payload !== null && payload !== undefined) parts.push(`payload_kg=${payload}`);
    return parts.join('&');
  }

  setStage(teamId, stage, score, payload, displacedStage) {
    const extra = [this.resultQuery(score, payload), this.displacedQuery(displacedStage)]
      .filter(Boolean).join('&');
    const path = `/teams/${encodeURIComponent(teamId)}/stage`
      + `?stage=${encodeURIComponent(stage)}${extra ? '&' + extra : ''}`;
    return this.request(path, { method: 'PUT' });
  }

  advanceStage(teamId, score, payload, displacedStage) {
    const extra = [this.resultQuery(score, payload), this.displacedQuery(displacedStage)]
      .filter(Boolean).join('&');
    const path = `/teams/${encodeURIComponent(teamId)}/stage/advance${extra ? '?' + extra : ''}`;
    return this.post(path);
  }

  displacedQuery(stage) {
    return stage ? `displaced_stage=${encodeURIComponent(stage)}` : '';
  }

  nextBattery(teamId) {
    return this.post(`/teams/${encodeURIComponent(teamId)}/next-battery`);
  }

  getQueue() {
    return this.request('/queue');
  }

  replaceQueue(entries) {
    return this.sendJson('/queue', 'PUT', entries);
  }

  advanceQueue() {
    return this.post('/queue/advance');
  }

  getTimer() {
    return this.request('/timer');
  }

  startTimer() {
    return this.post('/timer/start');
  }

  pauseTimer() {
    return this.post('/timer/pause');
  }

  resetTimer(seconds) {
    return this.post(seconds ? `/timer/reset?duration_seconds=${seconds}` : '/timer/reset');
  }

  setTimerDuration(seconds) {
    return this.sendJson('/timer', 'PUT', { duration_seconds: seconds });
  }
}

customElements.define('api-service', ApiService);
