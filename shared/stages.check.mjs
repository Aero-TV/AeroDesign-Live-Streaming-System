/**
 * Self-check for the stage tables. Run with: node shared/stages.check.mjs
 *
 * STAGE_BACK is what the board's ← arrow walks, and it has no backend
 * counterpart to validate it, so the properties the arrow depends on are
 * asserted here instead. Cheap insurance against the next edit to STAGE_FLOW
 * leaving the two tables disagreeing.
 */

import { strict as assert } from 'node:assert';
import { STAGE_ORDER, STAGE_FLOW, STAGE_BACK, TERMINAL_STAGES } from './stages.js';

const at = (stage) => STAGE_ORDER.indexOf(stage);

for (const stage of STAGE_ORDER) {
  assert.ok(stage in STAGE_BACK, `STAGE_BACK is missing '${stage}'`);
  assert.ok(stage in STAGE_FLOW, `STAGE_FLOW is missing '${stage}'`);

  const back = STAGE_BACK[stage];
  if (back === null) continue;

  assert.ok(at(back) >= 0, `'${stage}' goes back to unknown stage '${back}'`);

  // A back arrow that moved a team forward, or sideways into a branch, would
  // be a stage change the operator did not ask for.
  assert.ok(
    at(back) < at(stage),
    `going back from '${stage}' to '${back}' is not backwards`
  );

  // The one thing the arrow must never do: land on a stage that records a
  // battery result. The forward arrow is guarded for this in the control
  // panel; the back arrow relies on it being impossible.
  assert.ok(
    !TERMINAL_STAGES.includes(back),
    `going back from '${stage}' would record a result in '${back}'`
  );
}

// Only the first stage has nothing behind it, or a team could get stranded.
const stranded = STAGE_ORDER.filter((s) => STAGE_BACK[s] === null);
assert.deepEqual(stranded, [STAGE_ORDER[0]], `dead ends: ${stranded}`);

console.log(`stages.check: ${STAGE_ORDER.length} stages OK`);
