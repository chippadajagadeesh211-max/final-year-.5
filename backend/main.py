from datetime import datetime, timezone
from io import StringIO

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import Response

from .database import Base, SessionLocal, engine
from .engineering.factor_of_safety import StabilityInput, calculate_factor_of_safety
from .models import Alert, FosResult, GeotechnicalParameters, ModelRun, Prediction, Sensor, SensorReading, Slope
from .reporting import build_pdf_report


Base.metadata.create_all(bind=engine)

app = FastAPI(title="Smart Slope Stability Monitoring API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CSV_COLUMNS = [
    "timestamp",
    "rainfall_mm",
    "soil_moisture",
    "pore_pressure_kpa",
    "slope_movement_mm_day",
    "gnss_displacement_mm",
    "inclinometer_deg",
    "groundwater_head_m",
]
SENSOR_COLUMNS = {
    "rainfall_mm": ("Rainfall", "mm / 24h"),
    "soil_moisture": ("Soil moisture", "%"),
    "pore_pressure_kpa": ("Pore pressure", "kPa"),
    "slope_movement_mm_day": ("Slope movement", "mm / day"),
    "gnss_displacement_mm": ("GNSS displacement", "mm"),
    "inclinometer_deg": ("Inclinometer", "degrees"),
    "groundwater_head_m": ("Groundwater head", "m"),
}


class AnalysisRequest(BaseModel):
    height: float = Field(ge=0)
    angle: float = Field(gt=0, lt=90)
    cohesion: float = Field(ge=0)
    friction: float = Field(ge=0, lt=90)
    unitWeight: float = Field(ge=0)
    porePressure: float = Field(ge=0)
    groundwater: float = Field(ge=0)
    surcharge: float = Field(ge=0)
    seismic: float = Field(ge=0)


class SimulationRequest(BaseModel):
    scenario: str = Field(pattern="^(SAFE|WARNING|CRITICAL)$")
    step: int = Field(ge=0, le=10000)


def ensure_default_slope(session):
    slope = session.query(Slope).filter_by(id=1).first()
    if not slope:
        slope = Slope(id=1, name="Himalayan Field Study", latitude=27.7172, longitude=85.3240)
        session.add(slope)
        session.flush()
    demo_values = {
        "Rainfall": (205.0, "mm / 24h"),
        "Soil moisture": (74.5, "%"),
        "Pore pressure": (52.0, "kPa"),
        "Slope movement": (0.8, "mm / day"),
        "GNSS displacement": (2.1, "mm"),
        "Groundwater head": (7.4, "m"),
    }
    for name, (_, unit) in demo_values.items():
        if not session.query(Sensor).filter_by(slope_id=slope.id, name=name).first():
            session.add(Sensor(slope_id=slope.id, name=name, unit=unit))
    session.flush()
    for sensor in session.query(Sensor).filter_by(slope_id=slope.id).all():
        if not session.query(SensorReading).filter_by(sensor_id=sensor.id).first():
            value = demo_values.get(sensor.name)
            if value:
                session.add(SensorReading(sensor_id=sensor.id, timestamp=datetime.utcnow(), value=value[0]))
    return slope


def session_scope():
    session = SessionLocal()
    try:
        ensure_default_slope(session)
        session.commit()
        return session
    except Exception:
        session.rollback()
        session.close()
        raise


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "smart-slope-api", "database": "sqlite"}


@app.get("/api/dashboard")
def dashboard():
    session = session_scope()
    try:
        latest = session.query(FosResult).order_by(FosResult.id.desc()).first()
        fos = latest.fos if latest else 2.91
        return {
            "project": {"name": "Himalayan Field Study", "latitude": 27.7172, "longitude": 85.3240},
            "factor_of_safety": round(fos, 2),
            "stability_index": round(min(0.99, fos / 3.2), 2),
            "risk_percent": round(max(3, min(96, (3.4 - fos) * 11)), 1),
            "warning_status": "NORMAL" if fos >= 1.5 else "REVIEW",
            "demo_data": latest is None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        session.close()


@app.get("/api/sensors")
def sensors():
    session = session_scope()
    try:
        result = []
        for sensor in session.query(Sensor).filter_by(slope_id=1).all():
            reading = session.query(SensorReading).filter_by(sensor_id=sensor.id).order_by(SensorReading.timestamp.desc()).first()
            if reading:
                result.append({"name": sensor.name, "value": reading.value, "unit": sensor.unit, "status": "Normal", "updated_at": reading.timestamp.isoformat()})
        return {"demo_data": True, "sensors": result}
    finally:
        session.close()


@app.post("/api/analysis")
def analyze(parameters: AnalysisRequest):
    try:
        result = calculate_factor_of_safety(StabilityInput(**parameters.model_dump()))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    session = session_scope()
    try:
        session.add(GeotechnicalParameters(
            slope_id=1,
            height=parameters.height,
            angle=parameters.angle,
            cohesion=parameters.cohesion,
            friction=parameters.friction,
            unit_weight=parameters.unitWeight,
            pore_pressure=parameters.porePressure,
            groundwater=parameters.groundwater,
            surcharge=parameters.surcharge,
            seismic=parameters.seismic,
        ))
        session.add(FosResult(slope_id=1, fos=result["fos"], category=result["category"]))
        if result["category"] in ("WARNING", "CRITICAL"):
            session.add(Alert(
                slope_id=1,
                severity=result["category"],
                title="Stability assessment needs review",
                description=f"The calculated factor of safety is {result['fos']:.2f}. Review the input parameters and monitoring observations.",
            ))
        session.commit()
    finally:
        session.close()
    return result


@app.post("/api/simulation")
def simulate(request: SimulationRequest):
    session = session_scope()
    try:
        latest = session.query(FosResult).order_by(FosResult.id.desc()).first()
        start_fos = latest.fos if latest else 2.91
        drift = {"SAFE": 0.0, "WARNING": 0.024, "CRITICAL": 0.058}[request.scenario]
        fos = max(0.55, start_fos - request.step * drift)
        return {
            "demo_data": True,
            "scenario": request.scenario,
            "step": request.step,
            "fos": round(fos, 2),
            "category": "SAFE" if fos >= 1.5 else "CAUTION" if fos >= 1.2 else "WARNING" if fos >= 1 else "CRITICAL",
            "risk_percent": min(96, max(3, round((3.4 - fos) * 11 + (12 if request.scenario == "CRITICAL" else 5 if request.scenario == "WARNING" else 0)))),
            "readings": {
                "rainfall_mm": round(205 + request.step * (1.1 if request.scenario != "SAFE" else 0.2), 1),
                "soil_moisture": round(min(99, 74.5 + request.step * (0.24 if request.scenario != "SAFE" else 0.04)), 1),
                "pore_pressure_kpa": round(52 + request.step * (0.55 if request.scenario != "SAFE" else 0.08), 1),
                "slope_movement_mm_day": round(0.8 + request.step * (0.06 if request.scenario != "SAFE" else 0.01), 2),
                "gnss_displacement_mm": round(2.1 + request.step * 0.03, 2),
                "groundwater_head_m": round(7.4 + request.step * 0.01, 2),
            },
        }
    finally:
        session.close()


@app.get("/api/predictions")
def predictions():
    session = session_scope()
    try:
        latest = session.query(FosResult).order_by(FosResult.id.desc()).first()
        current = latest.fos if latest else 2.91
        estimate = round(max(0.6, current - 0.23), 2)
        session.add(Prediction(predicted_fos=estimate, mode="DEMO"))
        session.commit()
        return {
            "mode": "DEMO",
            "current_fos": round(current, 2),
            "predicted_fos": estimate,
            "change": round(estimate - current, 2),
            "label": "Demonstration estimate — not generated from a trained LSTM model.",
        }
    finally:
        session.close()


@app.post("/api/predictions/train")
async def train_prediction_model(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please choose a CSV file.")
    try:
        frame = pd.read_csv(StringIO((await file.read()).decode("utf-8-sig")))
        from .ml.lstm_model import predict_stability

        result = predict_stability(frame)
    except (UnicodeDecodeError, pd.errors.ParserError) as error:
        raise HTTPException(status_code=400, detail="We couldn't read this CSV. Check its delimiter and encoding, then try again.") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    session = session_scope()
    try:
        session.add(Prediction(predicted_fos=result.predicted_fos or 2.68, mode=result.mode))
        session.add(ModelRun(mode=result.mode, mae=result.mae, rmse=result.rmse))
        session.commit()
    finally:
        session.close()
    return result.__dict__


@app.get("/api/alerts")
def alerts():
    session = session_scope()
    try:
        stored = session.query(Alert).order_by(Alert.created_at.desc()).limit(50).all()
        return [{"id": item.id, "severity": item.severity, "title": item.title, "description": item.description, "created_at": item.created_at.isoformat()} for item in stored]
    finally:
        session.close()


@app.get("/api/reports/pdf")
def report_pdf():
    session = session_scope()
    try:
        latest = session.query(FosResult).order_by(FosResult.id.desc()).first()
        fos = latest.fos if latest else 2.91
        category = latest.category if latest else "SAFE"
        readings = []
        for sensor in session.query(Sensor).filter_by(slope_id=1).all():
            reading = session.query(SensorReading).filter_by(sensor_id=sensor.id).order_by(SensorReading.timestamp.desc()).first()
            if reading:
                readings.append({"name": sensor.name, "value": reading.value, "unit": sensor.unit})
        risk = min(96, max(3, round((3.4 - fos) * 11)))
        content = build_pdf_report(fos, category, risk, readings)
        return Response(content, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=smart-slope-report.pdf"})
    finally:
        session.close()


@app.post("/api/upload")
async def upload_monitoring_data(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please choose a CSV file.")
    try:
        contents = await file.read()
        frame = pd.read_csv(StringIO(contents.decode("utf-8-sig")))
    except (UnicodeDecodeError, pd.errors.ParserError) as error:
        raise HTTPException(status_code=400, detail="We couldn't read this CSV. Check its delimiter and encoding, then try again.") from error

    frame.columns = [str(column).strip().lower() for column in frame.columns]
    missing_columns = [column for column in CSV_COLUMNS if column not in frame.columns]
    if missing_columns:
        label = missing_columns[0].replace("_", " ")
        raise HTTPException(status_code=422, detail=f"{label.capitalize()} column is missing.")

    frame["timestamp"] = pd.to_datetime(frame["timestamp"], errors="coerce", utc=True)
    invalid_timestamps = int(frame["timestamp"].isna().sum())
    numeric_columns = list(SENSOR_COLUMNS)
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    missing_values = int(frame[numeric_columns].isna().sum().sum()) + invalid_timestamps
    total_values = max(1, len(frame) * (len(numeric_columns) + 1))
    valid_rows = frame.dropna(subset=["timestamp"])

    session = session_scope()
    inserted = 0
    try:
        sensors = {sensor.name: sensor for sensor in session.query(Sensor).filter_by(slope_id=1).all()}
        for column, (sensor_name, unit) in SENSOR_COLUMNS.items():
            sensor = sensors.get(sensor_name)
            if not sensor:
                sensor = Sensor(slope_id=1, name=sensor_name, unit=unit)
                session.add(sensor)
                session.flush()
                sensors[sensor_name] = sensor
            for row in valid_rows[["timestamp", column]].dropna().itertuples(index=False, name=None):
                stamp, value = row
                session.add(SensorReading(sensor_id=sensor.id, timestamp=stamp.to_pydatetime().replace(tzinfo=None), value=float(value)))
                inserted += 1
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    period = "No valid timestamps" if valid_rows.empty else f"{valid_rows['timestamp'].min().date()} to {valid_rows['timestamp'].max().date()}"
    return {
        "message": "Monitoring CSV validated and readings imported.",
        "columns_detected": CSV_COLUMNS,
        "records": int(len(frame)),
        "readings_imported": inserted,
        "monitoring_period": period,
        "missing_values": missing_values,
        "data_quality_percent": round(100 * (1 - missing_values / total_values), 1),
    }