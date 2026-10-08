from dataclasses import asdict, dataclass


THRESHOLDS = {"safe": 1.50, "caution": 1.20, "warning": 1.00}
ASSUMPTIONS = [
    "Homogeneous soil layer with a planar, slope-parallel failure surface.",
    "Total normal stress uses unit weight and slope height; pore pressure and groundwater head reduce effective stress.",
    "Surcharge and pseudo-static seismic demand are simplified additions to driving shear.",
    "Classification thresholds are academic project settings, not design acceptance criteria.",
]


@dataclass(frozen=True)
class StabilityInput:
    height: float
    angle: float
    cohesion: float
    friction: float
    unitWeight: float
    porePressure: float
    groundwater: float
    surcharge: float
    seismic: float


def classify_fos(fos: float) -> str:
    if fos >= THRESHOLDS["safe"]:
        return "SAFE"
    if fos >= THRESHOLDS["caution"]:
        return "CAUTION"
    if fos >= THRESHOLDS["warning"]:
        return "WARNING"
    return "CRITICAL"


def calculate_factor_of_safety(parameters: StabilityInput) -> dict:
    import math

    values = asdict(parameters)
    if any(value < 0 for value in values.values()):
        raise ValueError("Geotechnical parameters must be zero or greater.")
    if not 0 < parameters.angle < 90:
        raise ValueError("Slope angle must be greater than 0 and less than 90 degrees.")
    if not 0 <= parameters.friction < 90:
        raise ValueError("Friction angle must be between 0 and 90 degrees.")

    beta = math.radians(parameters.angle)
    phi = math.radians(parameters.friction)
    normal_stress = parameters.unitWeight * parameters.height * math.cos(beta) ** 2
    groundwater_pressure = parameters.groundwater * 2.2
    effective_normal_stress = max(0.0, normal_stress - parameters.porePressure - groundwater_pressure)
    resisting_shear = parameters.cohesion + effective_normal_stress * math.tan(phi)
    driving_shear = max(
        1.0,
        parameters.unitWeight * parameters.height * math.sin(beta) * math.cos(beta)
        + parameters.surcharge * math.sin(beta)
        + parameters.seismic * parameters.unitWeight * parameters.height,
    )
    fos = resisting_shear / driving_shear

    return {
        "fos": round(fos, 3),
        "category": classify_fos(fos),
        "intermediate": {
            "normal_stress_kpa": round(normal_stress, 2),
            "groundwater_pressure_kpa": round(groundwater_pressure, 2),
            "effective_normal_stress_kpa": round(effective_normal_stress, 2),
            "resisting_shear_kpa": round(resisting_shear, 2),
            "driving_shear_kpa": round(driving_shear, 2),
        },
        "assumptions": ASSUMPTIONS,
        "thresholds": THRESHOLDS,
    }