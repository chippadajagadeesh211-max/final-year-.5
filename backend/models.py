from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Slope(Base):
    __tablename__ = "slopes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), default="Himalayan Field Study")
    latitude: Mapped[float] = mapped_column(Float, default=27.7172)
    longitude: Mapped[float] = mapped_column(Float, default=85.3240)


class Sensor(Base):
    __tablename__ = "sensors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slope_id: Mapped[int] = mapped_column(ForeignKey("slopes.id"), default=1)
    name: Mapped[str] = mapped_column(String(80))
    unit: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="online")


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    value: Mapped[float] = mapped_column(Float)


class GeotechnicalParameters(Base):
    __tablename__ = "geotechnical_parameters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slope_id: Mapped[int] = mapped_column(ForeignKey("slopes.id"), default=1)
    height: Mapped[float] = mapped_column(Float)
    angle: Mapped[float] = mapped_column(Float)
    cohesion: Mapped[float] = mapped_column(Float)
    friction: Mapped[float] = mapped_column(Float)
    unit_weight: Mapped[float] = mapped_column(Float)
    pore_pressure: Mapped[float] = mapped_column(Float)
    groundwater: Mapped[float] = mapped_column(Float)
    surcharge: Mapped[float] = mapped_column(Float)
    seismic: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FosResult(Base):
    __tablename__ = "fos_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slope_id: Mapped[int] = mapped_column(ForeignKey("slopes.id"), default=1)
    fos: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slope_id: Mapped[int] = mapped_column(ForeignKey("slopes.id"), default=1)
    predicted_fos: Mapped[float] = mapped_column(Float)
    mode: Mapped[str] = mapped_column(String(40), default="DEMO")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slope_id: Mapped[int] = mapped_column(ForeignKey("slopes.id"), default=1)
    severity: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mode: Mapped[str] = mapped_column(String(40))
    mae: Mapped[float | None] = mapped_column(Float, nullable=True)
    rmse: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)