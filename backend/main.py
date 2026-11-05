"""
AeroDesign Competition - Live Transmission Overlay System
Backend API for controlling overlays during live broadcasts
"""

import json
import time
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import atmosphere

app = FastAPI(title="AeroDesign Overlay API", version="0.2.0")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

class FlightStatus(str, Enum):
    VALIDATED = "validated"
    INVALIDATED = "invalidated"
    PENDING = "pending"
    NOT_FLOWN = "not_flown"


class TeamStage(str, Enum):
    """
    Where a team physically is in the competition cycle.

    A team runs through this whole cycle once per battery, so the stage is
    always read together with the team's current_battery.
    """

    WAITING = "waiting"
    CALLED_FOR_INSPECTION = "called_for_inspection"
    INSPECTING = "inspecting"
    FLIGHT_QUEUE = "flight_queue"
    RUNWAY = "runway"
    FLYING = "flying"
    FLIGHT_SUCCESS = "flight_success"
    FLIGHT_FAILURE = "flight_failure"
    AWAITING_RESULT = "awaiting_result"
    VALIDATED = "validated"
    INVALIDATED = "invalidated"


# The path the "advance" button follows. Where the cycle branches, this takes
# the good outcome; the operator jumps straight to the other branch instead.
# A stage mapped to None is the end of the cycle for that battery.
STAGE_FLOW: Dict[str, Optional[str]] = {
    TeamStage.WAITING: TeamStage.CALLED_FOR_INSPECTION,
    TeamStage.CALLED_FOR_INSPECTION: TeamStage.INSPECTING,
    TeamStage.INSPECTING: TeamStage.FLIGHT_QUEUE,
    TeamStage.FLIGHT_QUEUE: TeamStage.RUNWAY,
    TeamStage.RUNWAY: TeamStage.FLYING,
    TeamStage.FLYING: TeamStage.FLIGHT_SUCCESS,
    TeamStage.FLIGHT_SUCCESS: TeamStage.AWAITING_RESULT,
    TeamStage.FLIGHT_FAILURE: TeamStage.AWAITING_RESULT,
    TeamStage.AWAITING_RESULT: TeamStage.VALIDATED,
    TeamStage.VALIDATED: None,
    TeamStage.INVALIDATED: None,
}

# Stages that close out a battery by recording its result.
TERMINAL_STAGES = {TeamStage.VALIDATED, TeamStage.INVALIDATED}

# The runway and the air are a single slot, not two. One aircraft is either
# lined up or airborne at any moment; nobody waits on the runway while another
# team flies. Whoever is next waits at the head of the flight line instead.
# Sharing any other stage is normal.
FLIGHT_SLOT_STAGES = (TeamStage.RUNWAY, TeamStage.FLYING)

# Where the team holding the slot goes when it has to be freed. The options
# depend on what that team was doing: a flight ends in success or failure,
# while a team that never got airborne goes back in line or is marked failed.
SLOT_RELEASE_OPTIONS: Dict[str, List[str]] = {
    TeamStage.FLYING: [TeamStage.FLIGHT_SUCCESS, TeamStage.FLIGHT_FAILURE],
    TeamStage.RUNWAY: [TeamStage.FLIGHT_QUEUE, TeamStage.FLIGHT_FAILURE],
}


class WeatherCondition(str, Enum):
    CLEAR = "clear"
    PARTLY_CLOUDY = "partly_cloudy"
    CLOUDY = "cloudy"
    RAIN = "rain"
    STORM = "storm"
    WIND = "wind"


class OverlayPanel(str, Enum):
    """Which expanded panel the overlay is currently showing, if any."""

    NONE = "none"
    RESULTS = "results"
    RANKING = "ranking"
    QUEUE = "queue"
    # Full-screen standings, the split-flap board.
    BOARD = "board"


class FlightResult(BaseModel):
    battery_number: int
    status: FlightStatus
    score: Optional[float] = None
    payload_kg: Optional[float] = None
    notes: Optional[str] = None


class Team(BaseModel):
    id: str
    name: str
    university: str
    aircraft_photo_url: Optional[str] = None
    current_battery: int
    stage: TeamStage = TeamStage.WAITING
    stage_changed_at: Optional[str] = None
    # Place in the flight line, 1 = next to be called. None unless queued.
    queue_position: Optional[int] = None
    flight_results: List[FlightResult] = []


class ForecastEntry(BaseModel):
    label: str
    condition: WeatherCondition = WeatherCondition.CLEAR
    temperature_c: float
    precip_chance_pct: int = 0


class Conditions(BaseModel):
    """Raw field readings. Everything else on the top bar is derived from these."""

    field_name: str = "Campo de Voo"
    field_elevation_m: float = 660.0
    temperature_c: float = 28.0
    humidity_pct: float = 55.0
    qnh_hpa: float = 1013.0
    wind_speed_kmh: float = 12.0
    wind_direction_deg: int = 90
    condition: WeatherCondition = WeatherCondition.CLEAR
    forecast: List[ForecastEntry] = []
    updated_at: Optional[str] = None


class QueueEntry(BaseModel):
    team_id: str
    battery_number: int
    scheduled_time: Optional[str] = None


class OverlayState(BaseModel):
    visible: bool = False
    current_team_id: Optional[str] = None
    show_top_bar: bool = True
    show_team_info: bool = True
    show_current_battery: bool = True
    show_takeoff_timer: bool = True
    panel: OverlayPanel = OverlayPanel.NONE
    custom_message: Optional[str] = None


class TimerSettings(BaseModel):
    duration_seconds: int = Field(default=300, ge=1, le=7200)


class TakeoffTimer:
    """
    Countdown for the window a team has to get airborne.

    Time is tracked as a start instant plus the remaining value at the last
    pause, so the countdown survives being polled at any rate and the client
    can interpolate smoothly between polls.
    """

    def __init__(self, duration_seconds: int = 300):
        self.duration_seconds = duration_seconds
        self.remaining_at_pause = float(duration_seconds)
        self.started_at: Optional[float] = None
        self.running = False

    def remaining_seconds(self) -> float:
        if self.running and self.started_at is not None:
            elapsed = time.monotonic() - self.started_at
            return max(0.0, self.remaining_at_pause - elapsed)
        return max(0.0, self.remaining_at_pause)

    def start(self) -> None:
        if self.running:
            return
        if self.remaining_seconds() <= 0:
            self.remaining_at_pause = float(self.duration_seconds)
        self.started_at = time.monotonic()
        self.running = True

    def pause(self) -> None:
        if not self.running:
            return
        self.remaining_at_pause = self.remaining_seconds()
        self.running = False
        self.started_at = None

    def reset(self, duration_seconds: Optional[int] = None) -> None:
        if duration_seconds is not None:
            self.duration_seconds = duration_seconds
        self.remaining_at_pause = float(self.duration_seconds)
        self.started_at = None
        self.running = False

    def to_dict(self) -> Dict[str, Any]:
        remaining = self.remaining_seconds()
        return {
            "running": self.running,
            "remaining_seconds": round(remaining, 1),
            "duration_seconds": self.duration_seconds,
            "expired": remaining <= 0,
        }


# ---------------------------------------------------------------------------
# In-memory storage (in production, use a real database)
# ---------------------------------------------------------------------------

teams_db: Dict[str, Team] = {}
overlay_state = OverlayState()
conditions = Conditions()
flight_queue: List[QueueEntry] = []
# The live line of teams that passed inspection and are waiting their turn, in
# order. Distinct from flight_queue above, which is the day's planned rundown.
flight_line: List[str] = []
takeoff_timer = TakeoffTimer()
# Positions as of the last time the full-screen board was taken down. The board
# animates the move from these to the current ones, so it shows what actually
# changed rather than flipping for its own sake.
ranking_snapshot: Dict[str, int] = {}


def sync_flight_line(team: Team, previous_stage: TeamStage) -> None:
    """
    Keep the line in step with the stage that was just applied.

    Joining the queue puts a team at the back; leaving it for any reason drops
    the team out and everyone behind moves up one place.
    """
    joining = team.stage == TeamStage.FLIGHT_QUEUE
    leaving = previous_stage == TeamStage.FLIGHT_QUEUE and not joining

    if joining and team.id not in flight_line:
        flight_line.append(team.id)
    elif leaving and team.id in flight_line:
        flight_line.remove(team.id)

    refresh_queue_positions()


def refresh_queue_positions() -> None:
    """Renumber the line from 1 and clear the position of everyone else."""
    # Drop anyone the line still lists who is no longer queued, so a stage set
    # by any route cannot leave a stale entry behind.
    stale = [
        team_id for team_id in flight_line
        if team_id not in teams_db
        or teams_db[team_id].stage != TeamStage.FLIGHT_QUEUE
    ]
    for team_id in stale:
        flight_line.remove(team_id)

    for team in teams_db.values():
        team.queue_position = None

    for index, team_id in enumerate(flight_line, start=1):
        teams_db[team_id].queue_position = index


def initialize_data():
    """Load teams, queue and field conditions from the seed JSON file."""
    global conditions, flight_queue

    data_path = Path(__file__).parent / "mock_data.json"

    try:
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Warning: seed data file not found at {data_path}")
        return
    except json.JSONDecodeError as e:
        print(f"Error parsing seed data JSON: {e}")
        return

    flight_line.clear()
    for team_data in data.get("teams", []):
        team = Team(**team_data)
        teams_db[team.id] = team
        # Seed order is the starting order of the line.
        if team.stage == TeamStage.FLIGHT_QUEUE:
            flight_line.append(team.id)

    refresh_queue_positions()

    if "conditions" in data:
        conditions = Conditions(**data["conditions"])
    conditions.updated_at = datetime.now(timezone.utc).isoformat()

    if "queue" in data:
        flight_queue = [QueueEntry(**entry) for entry in data["queue"]]
    else:
        # Fall back to team order so the "next up" panel has something to show.
        flight_queue = [
            QueueEntry(team_id=team.id, battery_number=team.current_battery)
            for team in teams_db.values()
        ]


initialize_data()


# ---------------------------------------------------------------------------
# Derived data
# ---------------------------------------------------------------------------

def build_ranking() -> List[Dict[str, Any]]:
    """
    Standings computed from validated flights.

    Only validated flights score. Ties keep the same position, which matches how
    the scoreboard is read on air.
    """
    rows = []
    for team in teams_db.values():
        validated = [
            r for r in team.flight_results
            if r.status == FlightStatus.VALIDATED and r.score is not None
        ]
        total = sum(r.score for r in validated)
        best = max((r.score for r in validated), default=None)
        best_payload = max(
            (r.payload_kg for r in validated if r.payload_kg is not None),
            default=None,
        )
        rows.append(
            {
                "team_id": team.id,
                "name": team.name,
                "university": team.university,
                "total_score": round(total, 2),
                "best_score": best,
                "best_payload_kg": best_payload,
                "flights_validated": len(validated),
            }
        )

    rows.sort(key=lambda r: r["total_score"], reverse=True)

    position = 0
    previous_score = None
    for index, row in enumerate(rows, start=1):
        if row["total_score"] != previous_score:
            position = index
            previous_score = row["total_score"]
        row["position"] = position
        # None the first time a team appears on the board.
        row["previous_position"] = ranking_snapshot.get(row["team_id"])

    return rows


def ranking_for_team(team_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not team_id:
        return None
    return next((r for r in build_ranking() if r["team_id"] == team_id), None)


def upcoming_teams(limit: int = 4) -> List[Dict[str, Any]]:
    """The teams queued after the one currently on air."""
    current_id = overlay_state.current_team_id

    start = 0
    if current_id:
        for index, entry in enumerate(flight_queue):
            if entry.team_id == current_id:
                start = index + 1
                break

    upcoming = []
    for entry in flight_queue[start:start + limit]:
        team = teams_db.get(entry.team_id)
        if not team:
            continue
        upcoming.append(
            {
                "team_id": entry.team_id,
                "name": team.name,
                "university": team.university,
                "battery_number": entry.battery_number,
                "scheduled_time": entry.scheduled_time,
            }
        )
    return upcoming


def conditions_payload() -> Dict[str, Any]:
    """Raw readings plus every value derived from them."""
    payload = conditions.model_dump()
    payload["derived"] = atmosphere.summarize(
        temperature_c=conditions.temperature_c,
        humidity_pct=conditions.humidity_pct,
        qnh_hpa=conditions.qnh_hpa,
        field_elevation_m=conditions.field_elevation_m,
    )
    return payload


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {
        "message": "AeroDesign Overlay API",
        "version": "0.2.0",
        "endpoints": {
            "overlay_state": "/api/overlay/state",
            "teams": "/api/teams",
            "conditions": "/api/conditions",
            "ranking": "/api/ranking",
            "queue": "/api/queue",
            "timer": "/api/timer",
            "control_panel": "/control-panel/index.html",
            "overlay_view": "/overlay/index.html",
        },
    }


# --- Overlay state ---------------------------------------------------------

@app.get("/api/overlay/state")
async def get_overlay_state():
    """
    Everything the overlay renders, in one payload.

    The OBS browser source polls this several times a second, so it is kept to a
    single request rather than making the overlay fan out to five endpoints.
    """
    result = {
        "visible": overlay_state.visible,
        # Included so a read-modify-write round trip through PUT preserves the
        # selected team. The expanded "team" object below is for rendering; this
        # is the field PUT actually reads.
        "current_team_id": overlay_state.current_team_id,
        "show_top_bar": overlay_state.show_top_bar,
        "show_team_info": overlay_state.show_team_info,
        "show_current_battery": overlay_state.show_current_battery,
        "show_takeoff_timer": overlay_state.show_takeoff_timer,
        "panel": overlay_state.panel.value,
        "custom_message": overlay_state.custom_message,
        "server_time": datetime.now().isoformat(),
        "conditions": conditions_payload(),
        "timer": takeoff_timer.to_dict(),
        "upcoming": upcoming_teams(),
        "team": None,
        "team_ranking": None,
        "ranking": build_ranking(),
    }

    if overlay_state.current_team_id:
        team = teams_db.get(overlay_state.current_team_id)
        if team:
            result["team"] = team.model_dump()
            result["team_ranking"] = ranking_for_team(team.id)

    return result


@app.put("/api/overlay/state")
async def update_overlay_state(state: OverlayState):
    """Replace the overlay state (called by the control panel)."""
    global overlay_state
    overlay_state = state
    return {"status": "success", "state": overlay_state}


@app.post("/api/overlay/show")
async def show_overlay(team_id: Optional[str] = None):
    """Show overlay, optionally switching to a specific team."""
    overlay_state.visible = True
    if team_id:
        if team_id not in teams_db:
            raise HTTPException(status_code=404, detail="Team not found")
        overlay_state.current_team_id = team_id
    return {"status": "success", "visible": True, "team_id": team_id}


@app.post("/api/overlay/hide")
async def hide_overlay():
    overlay_state.visible = False
    return {"status": "success", "visible": False}


@app.post("/api/overlay/toggle")
async def toggle_overlay():
    overlay_state.visible = not overlay_state.visible
    return {"status": "success", "visible": overlay_state.visible}


@app.post("/api/overlay/panel")
async def set_panel(panel: OverlayPanel):
    """Open one of the expanded panels, or close them with panel=none."""
    global ranking_snapshot

    previous = overlay_state.panel
    overlay_state.panel = panel

    # Take the snapshot when the board comes down, not when it goes up: while
    # it is open the overlay keeps polling, and a snapshot taken on opening
    # would equal the current positions by the second poll, erasing the very
    # movement the board exists to show.
    if previous == OverlayPanel.BOARD and panel != OverlayPanel.BOARD:
        ranking_snapshot = {r["team_id"]: r["position"] for r in build_ranking()}

    return {"status": "success", "panel": panel.value}


# --- Teams -----------------------------------------------------------------

@app.get("/api/teams")
async def get_teams():
    return list(teams_db.values())


@app.get("/api/teams/{team_id}")
async def get_team(team_id: str):
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")
    return teams_db[team_id]


@app.post("/api/teams")
async def create_team(team: Team):
    if team.id in teams_db:
        raise HTTPException(status_code=400, detail="Team already exists")
    teams_db[team.id] = team
    return {"status": "success", "team": team}


@app.put("/api/teams/{team_id}")
async def update_team(team_id: str, team: Team):
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")
    teams_db[team_id] = team
    return {"status": "success", "team": team}


@app.delete("/api/teams/{team_id}")
async def delete_team(team_id: str):
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")
    del teams_db[team_id]
    return {"status": "success", "message": f"Team {team_id} deleted"}


# --- Flight results --------------------------------------------------------

@app.post("/api/teams/{team_id}/results")
async def add_flight_result(team_id: str, result: FlightResult):
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")

    team = teams_db[team_id]
    existing = next(
        (r for r in team.flight_results if r.battery_number == result.battery_number),
        None,
    )
    if existing:
        team.flight_results[team.flight_results.index(existing)] = result
    else:
        team.flight_results.append(result)
    team.flight_results.sort(key=lambda r: r.battery_number)
    return {"status": "success", "team": team}


@app.put("/api/teams/{team_id}/battery")
async def update_current_battery(team_id: str, battery_number: int):
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")

    teams_db[team_id].current_battery = battery_number
    return {"status": "success", "team": teams_db[team_id]}


# --- Team stage (where each team is in the competition cycle) --------------

def record_battery_result(
    team: Team,
    status: FlightStatus,
    score: Optional[float],
    payload_kg: Optional[float],
) -> None:
    """
    Write the outcome of the team's current battery.

    Reaching a terminal stage is the same event as the battery getting a
    result, so it is recorded here rather than asking the operator to enter the
    same fact twice in two places, where the two copies would drift apart over
    the course of an event.
    """
    existing = next(
        (r for r in team.flight_results if r.battery_number == team.current_battery),
        None,
    )
    result = FlightResult(
        battery_number=team.current_battery,
        status=status,
        score=score if score is not None else (existing.score if existing else None),
        payload_kg=payload_kg
        if payload_kg is not None
        else (existing.payload_kg if existing else None),
        notes=existing.notes if existing else None,
    )

    if existing:
        team.flight_results[team.flight_results.index(existing)] = result
    else:
        team.flight_results.append(result)
    team.flight_results.sort(key=lambda r: r.battery_number)


def slot_holder(excluding: str = "") -> Optional[Team]:
    """The single team currently lined up or airborne, if any."""
    return next(
        (
            t for t in teams_db.values()
            if t.stage in FLIGHT_SLOT_STAGES and t.id != excluding
        ),
        None,
    )


def apply_stage(
    team: Team,
    stage: TeamStage,
    score: Optional[float] = None,
    payload_kg: Optional[float] = None,
    displaced_stage: Optional[TeamStage] = None,
) -> None:
    """
    Move a team to a stage and run the side effects that stage implies.

    The broadcast follows the team onto the runway rather than waiting for the
    operator to also remember to select them, and the takeoff window starts and
    stops with the thing it actually measures.

    Moving into an exclusive stage evicts whoever holds it. The caller must say
    where that team goes: a team leaving the air has finished its flight, and
    only the operator knows how it went. Refusing rather than guessing keeps a
    wrong outcome from being recorded against the wrong team.
    """
    if stage in FLIGHT_SLOT_STAGES:
        holder = slot_holder(excluding=team.id)
        if holder is not None:
            # The options depend on what the holder was doing, not on where the
            # incoming team is headed.
            options = SLOT_RELEASE_OPTIONS[holder.stage]

            if displaced_stage is None:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "reason": "slot_occupied",
                        "stage": stage.value,
                        "occupant_team_id": holder.id,
                        "occupant_name": holder.name,
                        "occupant_stage": holder.stage.value,
                        "options": [o.value for o in options],
                    },
                )

            if displaced_stage not in options:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"A team leaving '{holder.stage.value}' cannot go to "
                        f"'{displaced_stage.value}'"
                    ),
                )

            # Free the slot first. None of the release options is itself a slot
            # stage, so this can never cascade.
            apply_stage(holder, displaced_stage)

    previous_stage = team.stage
    team.stage = stage
    team.stage_changed_at = datetime.now(timezone.utc).isoformat()

    if stage == TeamStage.RUNWAY:
        overlay_state.current_team_id = team.id
        takeoff_timer.reset()
        takeoff_timer.start()
    elif stage == TeamStage.FLYING:
        # They got airborne inside the window, so the countdown has done its job.
        takeoff_timer.pause()
    elif stage == TeamStage.VALIDATED:
        record_battery_result(team, FlightStatus.VALIDATED, score, payload_kg)
    elif stage == TeamStage.INVALIDATED:
        record_battery_result(team, FlightStatus.INVALIDATED, score, payload_kg)

    sync_flight_line(team, previous_stage)


def require_team(team_id: str) -> Team:
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")
    return teams_db[team_id]


@app.put("/api/teams/{team_id}/stage")
async def set_team_stage(
    team_id: str,
    stage: TeamStage,
    score: Optional[float] = None,
    payload_kg: Optional[float] = None,
    displaced_stage: Optional[TeamStage] = None,
):
    """Jump a team straight to any stage, for when the day goes off script."""
    team = require_team(team_id)
    apply_stage(team, stage, score, payload_kg, displaced_stage)
    return {"status": "success", "team": team}


@app.post("/api/teams/{team_id}/stage/advance")
async def advance_team_stage(
    team_id: str,
    score: Optional[float] = None,
    payload_kg: Optional[float] = None,
    displaced_stage: Optional[TeamStage] = None,
):
    """Move a team one step along the default path."""
    team = require_team(team_id)

    next_stage = STAGE_FLOW.get(team.stage)
    if next_stage is None:
        raise HTTPException(
            status_code=400,
            detail="Team has finished this battery; start the next one instead",
        )

    # Teams are called to the runway from the front of the line. Advancing
    # someone further back would silently jump the queue, so it is refused
    # here; a direct stage jump remains available when the day demands it.
    if team.stage == TeamStage.FLIGHT_QUEUE and team.queue_position != 1:
        head = teams_db[flight_line[0]] if flight_line else None
        raise HTTPException(
            status_code=400,
            detail=(
                f"{team.name} is {team.queue_position}º in line; "
                f"{head.name if head else 'another team'} is next"
            ),
        )

    apply_stage(team, next_stage, score, payload_kg, displaced_stage)
    return {"status": "success", "team": team}


@app.post("/api/teams/{team_id}/next-battery")
async def start_next_battery(team_id: str):
    """Close out this battery and put the team back at the start of the cycle."""
    team = require_team(team_id)

    if team.stage not in TERMINAL_STAGES:
        raise HTTPException(
            status_code=400,
            detail="Finish the current battery before starting the next one",
        )

    team.current_battery += 1
    apply_stage(team, TeamStage.WAITING)
    return {"status": "success", "team": team}


@app.put("/api/flight-line")
async def reorder_flight_line(team_ids: List[str]):
    """Reorder the line, for when teams swap places on the ground."""
    queued = {t.id for t in teams_db.values() if t.stage == TeamStage.FLIGHT_QUEUE}

    if set(team_ids) != queued:
        raise HTTPException(
            status_code=400,
            detail="The new order must list exactly the teams currently queued",
        )

    flight_line[:] = team_ids
    refresh_queue_positions()
    return {"status": "success", "flight_line": flight_line}


@app.get("/api/flight-line")
async def get_flight_line():
    return [
        {
            "position": index,
            "team_id": team_id,
            "name": teams_db[team_id].name,
            "battery_number": teams_db[team_id].current_battery,
        }
        for index, team_id in enumerate(flight_line, start=1)
    ]


@app.get("/api/stages")
async def get_stage_board():
    """Every stage with the teams currently sitting in it, in cycle order."""
    board = []
    for stage in TeamStage:
        members = [
            {
                "team_id": team.id,
                "name": team.name,
                "battery_number": team.current_battery,
                "stage_changed_at": team.stage_changed_at,
                "queue_position": team.queue_position,
            }
            for team in teams_db.values()
            if team.stage == stage
        ]

        # The line is an order, not a set, so hand it over in that order.
        if stage == TeamStage.FLIGHT_QUEUE:
            members.sort(key=lambda m: m["queue_position"] or 0)
        board.append(
            {
                "stage": stage.value,
                "next_stage": (STAGE_FLOW[stage].value if STAGE_FLOW[stage] else None),
                "count": len(members),
                "teams": members,
            }
        )
    return board


# --- Ranking ---------------------------------------------------------------

@app.get("/api/ranking")
async def get_ranking(limit: Optional[int] = None):
    ranking = build_ranking()
    return ranking[:limit] if limit else ranking


# --- Conditions ------------------------------------------------------------

@app.get("/api/conditions")
async def get_conditions():
    return conditions_payload()


@app.put("/api/conditions")
async def update_conditions(new_conditions: Conditions):
    global conditions
    new_conditions.updated_at = datetime.now(timezone.utc).isoformat()
    conditions = new_conditions
    return {"status": "success", "conditions": conditions_payload()}


# --- Flight queue ----------------------------------------------------------

@app.get("/api/queue")
async def get_queue():
    return {
        "queue": flight_queue,
        "current_team_id": overlay_state.current_team_id,
        "upcoming": upcoming_teams(),
    }


@app.put("/api/queue")
async def replace_queue(entries: List[QueueEntry]):
    global flight_queue
    unknown = [e.team_id for e in entries if e.team_id not in teams_db]
    if unknown:
        raise HTTPException(
            status_code=400, detail=f"Unknown teams in queue: {', '.join(unknown)}"
        )
    flight_queue = entries
    return {"status": "success", "queue": flight_queue}


@app.post("/api/queue/advance")
async def advance_queue():
    """
    Move the broadcast to the next team in the queue and reset its timer.

    This is the one-button action for "that team is done, bring up the next".
    """
    upcoming = upcoming_teams(limit=1)
    if not upcoming:
        raise HTTPException(status_code=400, detail="No teams left in the queue")

    next_team = upcoming[0]
    overlay_state.current_team_id = next_team["team_id"]
    takeoff_timer.reset()
    return {"status": "success", "current_team_id": next_team["team_id"]}


# --- Takeoff timer ---------------------------------------------------------

@app.get("/api/timer")
async def get_timer():
    return takeoff_timer.to_dict()


@app.post("/api/timer/start")
async def start_timer():
    takeoff_timer.start()
    return takeoff_timer.to_dict()


@app.post("/api/timer/pause")
async def pause_timer():
    takeoff_timer.pause()
    return takeoff_timer.to_dict()


@app.post("/api/timer/reset")
async def reset_timer(duration_seconds: Optional[int] = None):
    takeoff_timer.reset(duration_seconds)
    return takeoff_timer.to_dict()


@app.put("/api/timer")
async def set_timer_duration(settings: TimerSettings):
    takeoff_timer.reset(settings.duration_seconds)
    return takeoff_timer.to_dict()


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------

class NoCacheFiles(StaticFiles):
    """
    Static files that are never cached.

    StaticFiles sends only an etag and last-modified, which lets a browser
    reuse a component on heuristic freshness without asking. During an event
    that means a fix pushed between flights may not reach the operator's open
    tab, and the symptom - a control that behaves like the old version - looks
    like a bug in the code rather than a stale copy. Everything here is served
    from localhost, so re-reading it costs nothing worth measuring.
    """

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-store"
        return response


overlay_dir = Path(__file__).parent.parent / "overlay"
control_panel_dir = Path(__file__).parent.parent / "control-panel"
shared_dir = Path(__file__).parent.parent / "shared"

if overlay_dir.exists():
    app.mount("/overlay", NoCacheFiles(directory=str(overlay_dir)), name="overlay")

if control_panel_dir.exists():
    app.mount(
        "/control-panel",
        NoCacheFiles(directory=str(control_panel_dir)),
        name="control-panel",
    )

if shared_dir.exists():
    app.mount("/shared", NoCacheFiles(directory=str(shared_dir)), name="shared")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
