"""
Atmospheric calculations for the broadcast overlay.

Air density is the number that matters most in AeroDesign: the payload an
aircraft can lift scales with it. These helpers turn the readings a ground
crew can actually take (thermometer, hygrometer, altimeter setting) into the
derived values the broadcast shows - air density, density altitude and
pressure altitude.

All functions are pure so they can be unit tested without the API running.
"""

import math
from typing import Dict

# International Standard Atmosphere reference values at mean sea level
ISA_PRESSURE_HPA = 1013.25
ISA_TEMPERATURE_C = 15.0
ISA_DENSITY_KG_M3 = 1.225

# Specific gas constants, J/(kg K)
R_DRY_AIR = 287.058
R_WATER_VAPOR = 461.495

# Exponents of the ISA troposphere model
_ISA_PRESSURE_EXPONENT = 5.25588
_ISA_DENSITY_EXPONENT = 4.2558797
_ISA_LAPSE_FACTOR = 2.25577e-5

METERS_TO_FEET = 3.280839895


def saturation_vapor_pressure_hpa(temperature_c: float) -> float:
    """Saturation vapor pressure via the Tetens approximation, in hPa."""
    return 6.1078 * 10 ** (7.5 * temperature_c / (temperature_c + 237.3))


def vapor_pressure_hpa(temperature_c: float, humidity_pct: float) -> float:
    """Actual water vapor partial pressure, in hPa."""
    humidity = max(0.0, min(100.0, humidity_pct))
    return saturation_vapor_pressure_hpa(temperature_c) * humidity / 100.0


def dew_point_c(temperature_c: float, humidity_pct: float) -> float:
    """Dew point via the Magnus formula, in degrees Celsius."""
    humidity = max(1.0, min(100.0, humidity_pct))
    a, b = 17.27, 237.7
    gamma = (a * temperature_c) / (b + temperature_c) + math.log(humidity / 100.0)
    return (b * gamma) / (a - gamma)


def station_pressure_hpa(qnh_hpa: float, field_elevation_m: float) -> float:
    """
    Absolute pressure at the field, in hPa.

    QNH is the altimeter setting reduced to sea level, which is what a weather
    report gives you. The aircraft actually flies in the pressure present at
    field elevation, so convert before computing density.
    """
    return qnh_hpa * (1 - _ISA_LAPSE_FACTOR * field_elevation_m) ** _ISA_PRESSURE_EXPONENT


def air_density_kg_m3(
    temperature_c: float, humidity_pct: float, station_pressure: float
) -> float:
    """
    Density of humid air, in kg/m3.

    Dry air and water vapor are summed as separate ideal gases. Humid air is
    lighter than dry air at the same temperature and pressure, which is why the
    vapor term uses a larger gas constant.
    """
    temperature_k = temperature_c + 273.15
    pv = vapor_pressure_hpa(temperature_c, humidity_pct)
    pd = station_pressure - pv

    dry_term = (pd * 100.0) / (R_DRY_AIR * temperature_k)
    vapor_term = (pv * 100.0) / (R_WATER_VAPOR * temperature_k)
    return dry_term + vapor_term


def density_altitude_m(density_kg_m3: float) -> float:
    """
    Altitude at which the standard atmosphere has the given density, in meters.

    This is the altitude the aircraft "feels". On a hot, humid day it sits well
    above the real field elevation, and takeoff performance degrades with it.
    """
    ratio = density_kg_m3 / ISA_DENSITY_KG_M3
    return (1 - ratio ** (1 / _ISA_DENSITY_EXPONENT)) / _ISA_LAPSE_FACTOR


def pressure_altitude_m(station_pressure: float) -> float:
    """Altitude at which the standard atmosphere has the given pressure, in meters."""
    ratio = station_pressure / ISA_PRESSURE_HPA
    return (1 - ratio ** (1 / _ISA_PRESSURE_EXPONENT)) / _ISA_LAPSE_FACTOR


def relative_density_pct(density_kg_m3: float) -> float:
    """Density as a percentage of ISA sea level density."""
    return density_kg_m3 / ISA_DENSITY_KG_M3 * 100.0


def summarize(
    temperature_c: float,
    humidity_pct: float,
    qnh_hpa: float,
    field_elevation_m: float,
) -> Dict[str, float]:
    """
    Compute every derived value the overlay displays from the four raw readings.

    Returned distances come in both meters and feet so the overlay can switch
    units without recomputing anything.
    """
    station = station_pressure_hpa(qnh_hpa, field_elevation_m)
    density = air_density_kg_m3(temperature_c, humidity_pct, station)
    da_m = density_altitude_m(density)
    pa_m = pressure_altitude_m(station)

    return {
        "station_pressure_hpa": round(station, 1),
        "air_density_kg_m3": round(density, 4),
        "relative_density_pct": round(relative_density_pct(density), 1),
        "density_altitude_m": round(da_m),
        "density_altitude_ft": round(da_m * METERS_TO_FEET),
        "pressure_altitude_m": round(pa_m),
        "pressure_altitude_ft": round(pa_m * METERS_TO_FEET),
        "dew_point_c": round(dew_point_c(temperature_c, humidity_pct), 1),
    }
