"""Tests for the atmospheric calculations behind the overlay's top bar."""

import pytest

from backend import atmosphere


def test_isa_sea_level_reproduces_standard_density():
    """Feeding the ISA reference conditions back in must return ISA density."""
    density = atmosphere.air_density_kg_m3(
        temperature_c=15.0, humidity_pct=0.0, station_pressure=1013.25
    )
    assert density == pytest.approx(1.225, abs=0.001)


def test_isa_sea_level_has_zero_density_altitude():
    assert atmosphere.density_altitude_m(1.225) == pytest.approx(0.0, abs=1.0)


def test_station_pressure_drops_with_elevation():
    """At 800 m the field sees roughly 90 hPa less than the sea level setting."""
    station = atmosphere.station_pressure_hpa(qnh_hpa=1013.25, field_elevation_m=800)
    assert station == pytest.approx(920.8, abs=1.0)


def test_station_pressure_equals_qnh_at_sea_level():
    assert atmosphere.station_pressure_hpa(1013.25, 0) == pytest.approx(1013.25)


def test_humid_air_is_lighter_than_dry_air():
    """Water vapor displaces heavier N2/O2, so humidity lowers density."""
    dry = atmosphere.air_density_kg_m3(30.0, 0.0, 950.0)
    humid = atmosphere.air_density_kg_m3(30.0, 90.0, 950.0)
    assert humid < dry


def test_hot_day_pushes_density_altitude_above_field_elevation():
    """The scenario the commentators care about: hot high field, thin air."""
    summary = atmosphere.summarize(
        temperature_c=30.0, humidity_pct=60.0, qnh_hpa=1013.25, field_elevation_m=800
    )
    assert summary["density_altitude_m"] == pytest.approx(1605, abs=15)
    assert summary["density_altitude_m"] > 800


def test_cold_day_can_push_density_altitude_below_field_elevation():
    summary = atmosphere.summarize(
        temperature_c=5.0, humidity_pct=40.0, qnh_hpa=1020.0, field_elevation_m=800
    )
    assert summary["density_altitude_m"] < 800


def test_density_altitude_rises_monotonically_with_temperature():
    previous = None
    for temperature in (10.0, 20.0, 30.0, 40.0):
        summary = atmosphere.summarize(temperature, 50.0, 1013.25, 660)
        current = summary["density_altitude_m"]
        if previous is not None:
            assert current > previous
        previous = current


def test_dew_point_equals_temperature_at_saturation():
    assert atmosphere.dew_point_c(25.0, 100.0) == pytest.approx(25.0, abs=0.2)


def test_dew_point_is_below_temperature_when_dry():
    assert atmosphere.dew_point_c(30.0, 40.0) < 30.0


def test_relative_density_is_100_percent_at_isa():
    assert atmosphere.relative_density_pct(1.225) == pytest.approx(100.0, abs=0.1)


def test_summarize_reports_feet_consistent_with_meters():
    summary = atmosphere.summarize(28.0, 55.0, 1011.0, 660)
    # Both values are rounded independently, so they can drift by the meter
    # rounding (up to 0.5 m, ~1.6 ft) plus the foot rounding.
    expected_ft = summary["density_altitude_m"] * atmosphere.METERS_TO_FEET
    assert summary["density_altitude_ft"] == pytest.approx(expected_ft, abs=3)


def test_humidity_is_clamped_to_valid_range():
    """Bad operator input must not produce a nonsensical density."""
    over = atmosphere.air_density_kg_m3(25.0, 150.0, 950.0)
    at_max = atmosphere.air_density_kg_m3(25.0, 100.0, 950.0)
    assert over == pytest.approx(at_max)
