# TODO

Working notes for what's next on this project. Written so work can resume
without re-reading the whole conversation history.

## Done: full-screen standings board ("split-flap" / airport board)

The goal: when the operator opens it, a full-screen panel shows all 20 teams'
standings with a split-flap (Solari board) flip animation on the cells that
changed position since the board was last shown - like an airport departures
board. Teams appearing on it for the first time (no previous position) get a
distinct "first entry" animation rather than a flip from nothing.

### Done (backend, commit e88d600)

- `OverlayPanel.BOARD` added as a fourth panel mode (`none | results | ranking
  | queue | board`).
- `build_ranking()` now returns **all** teams instead of the top-8 slice.
  The old slice existed only because the small side ranking panel only had
  room for 8 rows; the full-screen board needs everyone.
- `ranking_snapshot: Dict[str, int]` (module global) holds each team's
  position as of the last time the board was closed.
- Each row from `build_ranking()` now carries `previous_position` (from the
  snapshot, or `None` for a team's first appearance).
- The snapshot is taken in `set_panel()` **when the board transitions away
  from BOARD**, not when it opens. Reasoning: the overlay keeps polling
  `/api/overlay/state` the whole time the board is up, so if the snapshot
  were taken on open, it would already match the live positions by the
  second poll (a few hundred ms later) and the flip would have nothing to
  animate. Taking it on close means "flip to reflect what changed while you
  weren't looking" the next time the board opens.

### Done (frontend + tests)

- `overlay/components/standings-board.js`: full-frame board, all 20 rows
  (position, team, university, best payload, total score). Own scrim at
  z-index 850, so it sits under the top bar (900) and the top bar stays on
  air while the board is up.
- Split-flap on the position digit: stacked `.face` layers folding around a
  hinge line with `rotateX`, cascading at 45ms per row after a 480ms lead so
  each line has settled before its number moves. Three cases, one shared
  delay formula (each face owns a 150ms slot indexed by `--k`):
  - moved: one flip, old number folding away as the new one drops in;
  - unchanged: nothing turns, which is what makes the movers readable;
  - no previous value: the flap **riffles** - blank card, two wrong numbers,
    then the real one - and the row's text cells drop in column by column
    while the number is still turning. This covers the board's first showing
    (where every row has `previous_position === null`) and a team new to the
    standings. A single flip out of nothing read as a glitch, which is why
    the first version slid those rows in instead; the riffle reads as the
    board setting a line it never held, so it replaced the slide.
  - The riffle decoys are derived from the position (`(p + 7k) % 20 + 1`)
    rather than random, so a re-render riffles through the same numbers. That
    expression can never land on the real position for k in 1..2.
- The flip lives in `template()` and the moves are in `renderKey()`, so it
  plays once on open instead of restarting on every 250ms poll; scores and
  payloads are patched in `update()`, so a score ticking does not replay the
  cascade.
- `overlay/index.html`: board wired on `state.panel === 'board'`, and it
  hides the lower third and the side `info-panel` while up (a full-screen
  graphic takes the frame rather than stacking on it). The small `ranking`
  panel is untouched.
- `control-panel/index.html`: fifth `Board` button in the panel-mode row.
- Fixed a regression the board work caused: dropping the top-8 slice from
  `build_ranking()` left the compact side panel (`panel=ranking`) drawing all
  20 rows, ~1050px tall anchored 236px off the rodapé, so it ran off the top
  of the frame. The row limit now lives in `info-panel.js`
  (`RANKING_ROWS = 5`), which is where the space actually runs out - trimming
  in the backend would starve the full-screen board instead. Consequence
  worth knowing: with 5 rows the on-air team is only highlighted there when
  it is in the top 5.
- `backend/test_api.py`: 6 new tests (65 pass, was 59) - ranking covers the
  whole field, `previous_position` is `None` until the board has been shown,
  the snapshot is taken on close, it survives later scoring, it survives
  while the board stays open, and switching between non-board panels leaves
  it alone.
- The `reset_state` fixture now also resets `overlay_state` and
  `ranking_snapshot` (via the module, since both are rebound rather than
  mutated by their endpoints). Without it a test that left the board open
  made the next test's panel switch take a snapshot - the same leak would
  have hit any future test touching the panel.

### Still open

- **Trigger model**: manual-only, via the `Board` button, consistent with
  how `results`/`ranking`/`queue` work. The original ask ("aquela situação
  geral pela primeira vez... tem que ter uma saída") was ambiguous about
  whether it should also auto-open on an event (e.g. right after a battery
  result is recorded). Waiting on the user to redirect if they want an
  auto-trigger on top.
- **The flip has not been watched on a real screen yet** - only the data
  driving it was verified (`previous_position` moves as expected over the
  API). Worth one look in the preview at `?dev=1` before it goes on air.

## Known gaps / explicitly deferred (raised earlier in the project, not yet acted on)

These were flagged to the user as trade-offs but intentionally left as-is
pending their input:

- **No persistence.** All state (teams, stages, flight line, conditions,
  overlay state, ranking snapshot) lives in in-memory globals in
  `backend/main.py`. A server restart loses every live edit and reloads
  `backend/mock_data.json` from scratch. This is the highest-value next fix
  if the app is going to be used at a real event - a crash or restart
  mid-competition would wipe all recorded results and stage progress.
- **Runway/flying auto-selects the on-air team** (`apply_stage()` sets
  `overlay_state.current_team_id` when a team reaches `RUNWAY`). Flagged to
  the user as an automation decision they might want to override; not yet
  revisited.
- **Takeoff timer starts on RUNWAY, stops on FLYING** - same status, flagged
  but not revisited.
- **Advance-to-runway gate**: `POST /teams/{id}/stage/advance` refuses to
  call a team to the runway unless they're 1st in the flight line (a direct
  `PUT .../stage?stage=runway` jump still bypasses this). Flagged as a
  judgment call; no pushback received yet.

## Recently completed (context for the above)

- Team stage/lifecycle tracking end-to-end: `TeamStage` enum, `STAGE_FLOW`,
  advance/jump endpoints, `/api/stages` board endpoint, control panel
  `stage-control` + `stage-board` components, stage chip on team cards.
- Single flight-slot model: the runway and "flying" are actually one shared
  slot (only one aircraft is ever lined up or airborne at a time); the team
  waiting its turn sits in an ordered, numbered flight line instead
  (`flight_line` global, `queue_position` on `Team`, `/api/flight-line`
  endpoints). Taking the slot while occupied returns 409 with the valid
  hand-off destinations; the control panel's `stage-prompt` dialog asks the
  operator to resolve it rather than guessing.
- Full visual redesign of the overlay (status bar, team lower-third with
  stage-colored eyebrow + takeoff countdown ring, expandable info panel) and
  control panel, all sharing `shared/styles/tokens.css` +
  `shared/styles/theme.js`.
- `backend/atmosphere.py`: density altitude / air density calculations for
  the status bar, covered by `backend/test_atmosphere.py`.
- Test suite: 65 tests passing (`./dev.sh test`), covering atmosphere math,
  overlay state round-tripping, ranking/ties, conditions, queue, timer, team
  stages, flight-slot exclusivity, and flight-line ordering.

## How to pick this back up

```bash
./dev.sh install   # if dependencies aren't already synced
./dev.sh start      # backend on http://localhost:8000
./dev.sh test        # 65 tests should pass
```

Overlay preview: `http://localhost:8000/overlay/index.html?dev=1`
The preview plays `overlay/assets/sample.mp4` behind the overlay (currently a
synthetic sky/field clip generated with ffmpeg - replace it with real footage,
or pass `&sample=<url>`). The video only gets a src under `?dev=1`, so the OBS
source stays transparent.
Control panel: `http://localhost:8000/control-panel/index.html`

Branch: `claude/new-branch-n3rd9c`
