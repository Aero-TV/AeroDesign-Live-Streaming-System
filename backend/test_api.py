"""Tests for the overlay API."""

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.main import app, initialize_data, takeoff_timer


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def reset_everything():
    """
    Back to a freshly started server: seed data, no one on air, no panel open.

    The app holds its data in module-level globals, so without this a test that
    moves a team leaves it moved for every test after it. That matters most for
    the exclusive stages, where a leftover occupant makes an unrelated test fail
    depending on the order it happened to run in - and for the panel, where a
    board left open makes the next test's panel switch take a position snapshot.
    Both globals are rebound rather than mutated by their endpoints, so they are
    reset through the module.
    """
    initialize_data()
    takeoff_timer.reset(300)
    main.overlay_state = main.OverlayState()
    main.ranking_snapshot = {}


@pytest.fixture(autouse=True)
def reset_state():
    reset_everything()
    yield
    reset_everything()


def clear_flight_path(client):
    """
    Empty the slot and the line, for tests that are about something else.

    The line matters as much as the slot: a team joining behind the seeded
    teams cannot be advanced onto the runway, since only the front is called.
    """
    for row in client.get("/api/stages").json():
        if row["stage"] in ("runway", "flying", "flight_queue"):
            for team in row["teams"]:
                client.put(f"/api/teams/{team['team_id']}/stage?stage=waiting")


# --- Overlay state ---------------------------------------------------------

def test_state_round_trip_preserves_selected_team(client):
    """
    Read-modify-write is the natural way to change one setting, so GET must
    return everything PUT needs. It previously returned the expanded team
    object only, and writing the payload back silently cleared the selection.
    """
    client.post("/api/overlay/show?team_id=team007")

    state = client.get("/api/overlay/state").json()
    state["custom_message"] = "mensagem de teste"
    assert client.put("/api/overlay/state", json=state).status_code == 200

    after = client.get("/api/overlay/state").json()
    assert after["team"] is not None
    assert after["team"]["id"] == "team007"
    assert after["custom_message"] == "mensagem de teste"


def test_state_includes_everything_the_overlay_draws(client):
    """The OBS source polls this endpoint alone, so it must be self-sufficient."""
    body = client.get("/api/overlay/state").json()
    for key in ("conditions", "timer", "upcoming", "ranking", "panel", "visible"):
        assert key in body
    assert "derived" in body["conditions"]


def test_show_unknown_team_is_rejected(client):
    assert client.post("/api/overlay/show?team_id=nope").status_code == 404


def test_panel_rejects_unknown_mode(client):
    assert client.post("/api/overlay/panel?panel=bogus").status_code == 422
    assert client.post("/api/overlay/panel?panel=ranking").status_code == 200


# --- Ranking ---------------------------------------------------------------

def test_ranking_is_ordered_by_total_score(client):
    ranking = client.get("/api/ranking").json()
    scores = [row["total_score"] for row in ranking]
    assert scores == sorted(scores, reverse=True)


def test_ranking_only_counts_validated_flights(client):
    """An invalidated flight must not contribute to the total."""
    client.post(
        "/api/teams/team001/results",
        json={"battery_number": 9, "status": "invalidated", "score": 999.0},
    )
    row = next(r for r in client.get("/api/ranking").json() if r["team_id"] == "team001")
    assert row["total_score"] < 999.0


def test_ranking_covers_every_team(client):
    """The full-screen board shows the whole field, not a podium slice."""
    assert len(client.get("/api/ranking").json()) == len(client.get("/api/teams").json())


# --- The board's position snapshot -----------------------------------------

def board_row(client, team_id):
    return next(r for r in client.get("/api/ranking").json() if r["team_id"] == team_id)


def test_previous_position_is_none_until_the_board_has_been_shown(client):
    """Nothing to flip from on the first showing, so rows must debut instead."""
    assert all(r["previous_position"] is None for r in client.get("/api/ranking").json())


def test_snapshot_is_taken_when_the_board_comes_down(client):
    live = board_row(client, "team001")["position"]

    client.post("/api/overlay/panel?panel=board")
    client.post("/api/overlay/panel?panel=none")

    assert board_row(client, "team001")["previous_position"] == live


def test_previous_position_holds_the_snapshot_after_the_standings_move(client):
    """
    The flip animates from where a team stood when the board was last down to
    where it stands now, so the snapshot must survive later scoring.
    """
    client.post("/api/overlay/panel?panel=board")
    client.post("/api/overlay/panel?panel=none")
    was = board_row(client, "team020")["previous_position"]

    client.post(
        "/api/teams/team020/results",
        json={"battery_number": 9, "status": "validated", "score": 500.0},
    )

    row = board_row(client, "team020")
    assert row["position"] == 1
    assert row["previous_position"] == was
    assert was != 1


def test_snapshot_survives_while_the_board_stays_open(client):
    """
    The overlay polls throughout, so a snapshot taken on opening would match the
    live positions within a few hundred milliseconds and there would be nothing
    left to animate.
    """
    client.post("/api/overlay/panel?panel=board")
    client.post("/api/overlay/panel?panel=none")

    client.post("/api/overlay/panel?panel=board")
    client.post(
        "/api/teams/team019/results",
        json={"battery_number": 9, "status": "validated", "score": 400.0},
    )

    row = board_row(client, "team019")
    assert row["previous_position"] is not None
    assert row["previous_position"] != row["position"]


def test_switching_between_other_panels_leaves_the_snapshot_alone(client):
    client.post("/api/overlay/panel?panel=results")
    client.post("/api/overlay/panel?panel=ranking")
    client.post("/api/overlay/panel?panel=queue")

    assert all(r["previous_position"] is None for r in client.get("/api/ranking").json())


def test_tied_teams_share_a_position(client):
    ranking = client.get("/api/ranking").json()
    by_score = {}
    for row in ranking:
        by_score.setdefault(row["total_score"], set()).add(row["position"])
    for positions in by_score.values():
        assert len(positions) == 1


def test_flight_status_must_be_a_known_value(client):
    response = client.post(
        "/api/teams/team001/results",
        json={"battery_number": 5, "status": "made_up", "score": 1.0},
    )
    assert response.status_code == 422


def test_adding_a_result_replaces_the_same_battery(client):
    """Re-scoring a battery must correct it, not append a duplicate row."""
    client.post(
        "/api/teams/team002/results",
        json={"battery_number": 2, "status": "validated", "score": 10.0},
    )
    client.post(
        "/api/teams/team002/results",
        json={"battery_number": 2, "status": "validated", "score": 20.0},
    )
    team = client.get("/api/teams/team002").json()
    battery_2 = [r for r in team["flight_results"] if r["battery_number"] == 2]
    assert len(battery_2) == 1
    assert battery_2[0]["score"] == 20.0


# --- Conditions ------------------------------------------------------------

def test_conditions_derive_values_from_readings(client):
    response = client.put(
        "/api/conditions",
        json={
            "field_name": "Teste",
            "field_elevation_m": 800,
            "temperature_c": 30.0,
            "humidity_pct": 60.0,
            "qnh_hpa": 1013.25,
            "wind_speed_kmh": 10,
            "wind_direction_deg": 90,
            "condition": "clear",
            "forecast": [],
        },
    )
    assert response.status_code == 200

    derived = client.get("/api/conditions").json()["derived"]
    assert derived["density_altitude_m"] == pytest.approx(1605, abs=15)
    assert derived["density_altitude_m"] > 800


def test_conditions_reject_unknown_weather(client):
    response = client.put(
        "/api/conditions",
        json={
            "field_elevation_m": 800, "temperature_c": 30.0, "humidity_pct": 60.0,
            "qnh_hpa": 1013.0, "wind_speed_kmh": 10, "wind_direction_deg": 90,
            "condition": "meteor_shower", "forecast": [],
        },
    )
    assert response.status_code == 422


# --- Queue -----------------------------------------------------------------

def test_upcoming_excludes_the_team_already_on_air(client):
    client.post("/api/overlay/show?team_id=team003")
    body = client.get("/api/queue").json()
    assert "team003" not in [t["team_id"] for t in body["upcoming"]]


def test_advance_moves_to_the_next_team_and_resets_the_timer(client):
    client.post("/api/overlay/show?team_id=team003")
    expected = client.get("/api/queue").json()["upcoming"][0]["team_id"]

    client.post("/api/timer/start")
    assert client.post("/api/queue/advance").json()["current_team_id"] == expected

    timer = client.get("/api/timer").json()
    assert timer["running"] is False
    assert timer["remaining_seconds"] == timer["duration_seconds"]


def test_queue_rejects_unknown_teams(client):
    response = client.put(
        "/api/queue", json=[{"team_id": "ghost", "battery_number": 1}]
    )
    assert response.status_code == 400


# --- Timer -----------------------------------------------------------------

def test_timer_pause_holds_the_remaining_time(client):
    client.put("/api/timer", json={"duration_seconds": 120})
    client.post("/api/timer/start")
    client.post("/api/timer/pause")

    first = client.get("/api/timer").json()["remaining_seconds"]
    second = client.get("/api/timer").json()["remaining_seconds"]
    assert first == second


def test_timer_duration_must_be_positive(client):
    assert client.put("/api/timer", json={"duration_seconds": 0}).status_code == 422


# --- Team stage ------------------------------------------------------------

def set_stage(client, team_id, stage, **params):
    query = "".join(f"&{k}={v}" for k, v in params.items())
    return client.put(f"/api/teams/{team_id}/stage?stage={stage}{query}")


def test_advance_walks_the_default_path(client):
    clear_flight_path(client)
    set_stage(client, "team001", "waiting")

    expected = [
        "called_for_inspection", "inspecting", "flight_queue",
        "runway", "flying", "flight_success", "awaiting_result", "validated",
    ]
    for stage in expected:
        body = client.post("/api/teams/team001/stage/advance").json()
        assert body["team"]["stage"] == stage


def test_advance_past_the_end_of_a_battery_is_rejected(client):
    set_stage(client, "team001", "validated")
    response = client.post("/api/teams/team001/stage/advance")
    assert response.status_code == 400


def test_operator_can_jump_to_the_failure_branch(client):
    """The day goes off script; a direct jump must not be blocked."""
    set_stage(client, "team001", "flying")
    body = set_stage(client, "team001", "flight_failure").json()
    assert body["team"]["stage"] == "flight_failure"

    # The failure branch rejoins the flow at awaiting_result.
    body = client.post("/api/teams/team001/stage/advance").json()
    assert body["team"]["stage"] == "awaiting_result"


def test_reaching_validated_records_the_battery_result(client):
    """The stage and the result are one event, entered once."""
    team = client.get("/api/teams/team004").json()
    battery = team["current_battery"]

    set_stage(client, "team004", "validated", score=91.5, payload_kg=10.1)

    team = client.get("/api/teams/team004").json()
    result = next(r for r in team["flight_results"] if r["battery_number"] == battery)
    assert result["status"] == "validated"
    assert result["score"] == 91.5
    assert result["payload_kg"] == 10.1


def test_reaching_invalidated_records_the_battery_result(client):
    set_stage(client, "team004", "invalidated")
    team = client.get("/api/teams/team004").json()
    result = next(
        r for r in team["flight_results"]
        if r["battery_number"] == team["current_battery"]
    )
    assert result["status"] == "invalidated"


def test_recording_a_result_twice_corrects_it_in_place(client):
    set_stage(client, "team004", "validated", score=50.0)
    set_stage(client, "team004", "validated", score=80.0)

    team = client.get("/api/teams/team004").json()
    battery = team["current_battery"]
    rows = [r for r in team["flight_results"] if r["battery_number"] == battery]
    assert len(rows) == 1
    assert rows[0]["score"] == 80.0


def test_stage_result_feeds_the_standings(client):
    set_stage(client, "team004", "validated", score=95.0)
    row = next(r for r in client.get("/api/ranking").json() if r["team_id"] == "team004")
    assert row["best_score"] == 95.0


def test_runway_puts_the_team_on_air_and_starts_the_window(client):
    clear_flight_path(client)
    client.post("/api/overlay/show?team_id=team001")
    client.put("/api/timer", json={"duration_seconds": 240})

    set_stage(client, "team008", "runway")

    state = client.get("/api/overlay/state").json()
    assert state["current_team_id"] == "team008"
    assert state["timer"]["running"] is True


def test_takeoff_stops_the_window(client):
    clear_flight_path(client)
    set_stage(client, "team008", "runway")
    assert client.get("/api/timer").json()["running"] is True

    set_stage(client, "team008", "flying")
    assert client.get("/api/timer").json()["running"] is False


def test_next_battery_requires_finishing_the_current_one(client):
    set_stage(client, "team005", "flying")
    assert client.post("/api/teams/team005/next-battery").status_code == 400


def test_next_battery_resets_the_cycle(client):
    team = client.get("/api/teams/team005").json()
    before = team["current_battery"]

    set_stage(client, "team005", "validated", score=60.0)
    body = client.post("/api/teams/team005/next-battery").json()

    assert body["team"]["current_battery"] == before + 1
    assert body["team"]["stage"] == "waiting"


def test_unknown_stage_is_rejected(client):
    assert set_stage(client, "team001", "teleporting").status_code == 422


def test_stage_board_covers_every_stage_and_counts_all_teams(client):
    board = client.get("/api/stages").json()
    assert [row["stage"] for row in board][0] == "waiting"

    total = sum(row["count"] for row in board)
    assert total == len(client.get("/api/teams").json())


def test_overlay_state_exposes_the_current_team_stage(client):
    set_stage(client, "team002", "inspecting")
    client.post("/api/overlay/show?team_id=team002")
    assert client.get("/api/overlay/state").json()["team"]["stage"] == "inspecting"


# --- The flight slot -------------------------------------------------------

def occupants(client, stage):
    row = next(r for r in client.get("/api/stages").json() if r["stage"] == stage)
    return [t["team_id"] for t in row["teams"]]


def slot_holders(client):
    return occupants(client, "runway") + occupants(client, "flying")


def test_the_runway_and_the_air_are_one_slot(client):
    """Nobody waits on the runway while another team is airborne."""
    assert len(slot_holders(client)) == 1


def test_taking_the_slot_without_saying_how_the_flight_ended_is_refused(client):
    """
    Refusing beats guessing: the system cannot know whether the outgoing flight
    succeeded, and a wrong guess is recorded against a real team's battery.
    """
    holder = slot_holders(client)[0]

    response = set_stage(client, "team001", "runway")
    assert response.status_code == 409

    detail = response.json()["detail"]
    assert detail["reason"] == "slot_occupied"
    assert detail["occupant_team_id"] == holder
    assert detail["occupant_stage"] == "flying"
    assert set(detail["options"]) == {"flight_success", "flight_failure"}

    assert slot_holders(client) == [holder]


def test_the_options_follow_what_the_holder_was_doing(client):
    """A team that never got airborne did not have a flight to succeed at."""
    set_stage(client, "team016", "flight_success")
    set_stage(client, "team007", "runway")

    detail = set_stage(client, "team001", "runway").json()["detail"]
    assert detail["occupant_stage"] == "runway"
    assert set(detail["options"]) == {"flight_queue", "flight_failure"}


def test_freeing_the_slot_moves_the_holder_where_told(client):
    holder = slot_holders(client)[0]

    assert set_stage(
        client, "team001", "runway", displaced_stage="flight_success"
    ).status_code == 200

    assert slot_holders(client) == ["team001"]
    assert client.get(f"/api/teams/{holder}").json()["stage"] == "flight_success"


def test_a_team_leaving_the_air_cannot_go_just_anywhere(client):
    assert set_stage(
        client, "team001", "runway", displaced_stage="inspecting"
    ).status_code == 400


def test_a_team_never_displaces_itself(client):
    holder = slot_holders(client)[0]
    assert set_stage(client, holder, "runway").status_code == 200
    assert slot_holders(client) == [holder]


def test_multiple_teams_may_share_a_non_slot_stage(client):
    for team_id in ("team001", "team004", "team011"):
        assert set_stage(client, team_id, "inspecting").status_code == 200
    assert len(occupants(client, "inspecting")) >= 3


# --- The flight line -------------------------------------------------------

def line(client):
    return [row["team_id"] for row in client.get("/api/flight-line").json()]


def test_the_line_is_numbered_from_one(client):
    rows = client.get("/api/flight-line").json()
    assert [r["position"] for r in rows] == list(range(1, len(rows) + 1))


def test_passing_inspection_joins_the_back_of_the_line(client):
    before = line(client)
    set_stage(client, "team001", "flight_queue")

    assert line(client) == before + ["team001"]
    assert client.get("/api/teams/team001").json()["queue_position"] == len(before) + 1


def test_leaving_the_line_moves_everyone_behind_up(client):
    before = line(client)
    head, second = before[0], before[1]

    # The head is called to the runway; the slot is free once the flight ends.
    set_stage(client, "team016", "flight_success")
    set_stage(client, head, "runway")

    assert head not in line(client)
    assert client.get(f"/api/teams/{second}").json()["queue_position"] == 1


def test_only_the_front_of_the_line_is_called_by_advancing(client):
    """Advancing a team further back would silently jump the queue."""
    set_stage(client, "team016", "flight_success")
    second = line(client)[1]

    response = client.post(f"/api/teams/{second}/stage/advance")
    assert response.status_code == 400
    assert "in line" in response.json()["detail"]


def test_the_front_of_the_line_can_be_called(client):
    set_stage(client, "team016", "flight_success")
    head = line(client)[0]

    assert client.post(f"/api/teams/{head}/stage/advance").status_code == 200
    assert client.get(f"/api/teams/{head}").json()["stage"] == "runway"


def test_a_direct_jump_still_overrides_the_line_order(client):
    """The escape hatch stays open for when the day does not cooperate."""
    set_stage(client, "team016", "flight_success")
    second = line(client)[1]

    assert set_stage(client, second, "runway").status_code == 200


def test_queue_position_is_cleared_when_a_team_leaves(client):
    head = line(client)[0]
    set_stage(client, head, "waiting")
    assert client.get(f"/api/teams/{head}").json()["queue_position"] is None


def test_the_line_can_be_reordered(client):
    current = line(client)
    reversed_order = list(reversed(current))

    assert client.put("/api/flight-line", json=reversed_order).status_code == 200
    assert line(client) == reversed_order


def test_reordering_must_list_exactly_the_queued_teams(client):
    assert client.put("/api/flight-line", json=["team001"]).status_code == 400
