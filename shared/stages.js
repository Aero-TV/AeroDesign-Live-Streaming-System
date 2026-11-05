/**
 * The competition cycle a team runs through, once per battery.
 *
 * Shared by the overlay and the control panel so the two never drift apart on
 * what a stage is called or which colour it carries. The order here mirrors
 * STAGE_FLOW in the backend.
 */

export const STAGE_ORDER = [
  'waiting',
  'called_for_inspection',
  'inspecting',
  'flight_queue',
  'runway',
  'flying',
  'flight_success',
  'flight_failure',
  'awaiting_result',
  'validated',
  'invalidated'
];

/**
 * The path the advance action follows, mirroring STAGE_FLOW in the backend.
 *
 * Held here only so the button can name the stage it is about to move to; the
 * backend remains the authority on which transitions are allowed. null means
 * the cycle is finished for this battery.
 */
export const STAGE_FLOW = {
  waiting: 'called_for_inspection',
  called_for_inspection: 'inspecting',
  inspecting: 'flight_queue',
  flight_queue: 'runway',
  runway: 'flying',
  flying: 'flight_success',
  flight_success: 'awaiting_result',
  flight_failure: 'awaiting_result',
  awaiting_result: 'validated',
  validated: null,
  invalidated: null
};

/**
 * One step back, for undoing a stage the operator moved too early.
 *
 * Frontend-only: the backend has no "regress" action, so this is walked with a
 * direct stage jump. Where the cycle merges, this takes the good branch, the
 * same convention STAGE_FLOW uses where it splits. null means the start of the
 * cycle, with nothing behind it.
 */
export const STAGE_BACK = {
  waiting: null,
  called_for_inspection: 'waiting',
  inspecting: 'called_for_inspection',
  flight_queue: 'inspecting',
  runway: 'flight_queue',
  flying: 'runway',
  flight_success: 'flying',
  flight_failure: 'flying',
  awaiting_result: 'flight_success',
  validated: 'awaiting_result',
  invalidated: 'awaiting_result'
};

/** Stages that close a battery out. */
export const TERMINAL_STAGES = ['validated', 'invalidated'];

export const STAGE_LABELS = {
  waiting: 'Em espera',
  called_for_inspection: 'Chamada para inspeção',
  inspecting: 'Em inspeção',
  flight_queue: 'Na fila de voo',
  runway: 'Na pista',
  flying: 'Voando agora',
  flight_success: 'Voo concluído',
  flight_failure: 'Voo com falha',
  awaiting_result: 'Aguardando resultado',
  validated: 'Voo validado',
  invalidated: 'Voo invalidado'
};

/**
 * Colour family per stage:
 *   idle    - still waiting its turn, deliberately quiet
 *   active  - moving through the process
 *   live    - happening right now, in front of the camera
 *   pending - done flying, outcome not settled
 *   good / bad - the battery is closed
 */
export const STAGE_TONE = {
  waiting: 'idle',
  called_for_inspection: 'active',
  inspecting: 'active',
  flight_queue: 'active',
  runway: 'live',
  flying: 'live',
  flight_success: 'pending',
  flight_failure: 'bad',
  awaiting_result: 'pending',
  validated: 'good',
  invalidated: 'bad'
};

export const stageLabel = (stage) => STAGE_LABELS[stage] || stage || '—';
export const stageTone = (stage) => STAGE_TONE[stage] || 'idle';

/** Shared shadow-DOM styles for the stage tones. */
export const STAGE_STYLES = `
  .tone-idle    { --tone: var(--text-dim);  --tone-glow: rgba(100,116,139,.3); }
  .tone-active  { --tone: var(--accent);    --tone-glow: var(--accent-glow); }
  .tone-live    { --tone: #F87171;          --tone-glow: var(--bad-glow); }
  .tone-pending { --tone: var(--warn);      --tone-glow: var(--warn-glow); }
  .tone-good    { --tone: var(--ok);        --tone-glow: var(--ok-glow); }
  .tone-bad     { --tone: var(--bad);       --tone-glow: var(--bad-glow); }
`;
