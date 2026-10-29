"""Table mappings. The tables themselves are created by supabase/migrations/*.sql, never by the application.

Ids are plain strings in Python (UUID text), which keeps JSON, URLs and the estimation code simple.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Double, ForeignKey, Integer, String, Uuid, func
from sqlalchemy import Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

UUIDStr = Uuid(as_uuid=False)


def new_id() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True)
    full_name: Mapped[str] = mapped_column(String, default="")
    default_city: Mapped[str] = mapped_column(String, default="")
    default_wastage: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(UUIDStr)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    owner_name: Mapped[str] = mapped_column(String, default="")
    building_type: Mapped[str] = mapped_column(String, default="residential")
    location: Mapped[str] = mapped_column(String, default="")
    floors: Mapped[int] = mapped_column(Integer, default=1)
    currency: Mapped[str] = mapped_column(String, default="INR")
    budget: Mapped[float | None] = mapped_column(Double, nullable=True)
    length: Mapped[float] = mapped_column(Double)
    width: Mapped[float] = mapped_column(Double)
    height: Mapped[float] = mapped_column(Double, default=3.0)
    wall_thickness: Mapped[float] = mapped_column(Double, default=0.23)
    slab_thickness: Mapped[float] = mapped_column(Double, default=0.15)
    built_up_area: Mapped[float | None] = mapped_column(Double, nullable=True)
    # Estimate settings (JSON; defaults are applied by the engine)
    assumptions: Mapped[dict] = mapped_column(JSONB, default=dict)
    wastage: Mapped[dict] = mapped_column(JSONB, default=dict)
    material_selections: Mapped[dict] = mapped_column(JSONB, default=dict)  # estimate key -> material id
    extra_costs: Mapped[dict] = mapped_column(JSONB, default=dict)
    purchase_quantities: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    # Saved 3D/2D layout: custom openings, furniture arrangement, settings and a summary used by the estimator
    layout: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rooms: Mapped[list[Room]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="(Room.floor_number, Room.created_at)",
    )
    floorplans: Mapped[list[FloorPlan]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="FloorPlan.created_at")
    estimates: Mapped[list[Estimate]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="Estimate.created_at.desc()")
    reports: Mapped[list[Report]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="Report.created_at.desc()")


class Room(Base):
    __tablename__ = "project_rooms"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    owner_id: Mapped[str] = mapped_column(UUIDStr)
    name: Mapped[str] = mapped_column(String)
    room_type: Mapped[str] = mapped_column(String, default="other")
    length: Mapped[float] = mapped_column(Double)
    width: Mapped[float] = mapped_column(Double)
    height: Mapped[float] = mapped_column(Double, default=3.0)
    floor_number: Mapped[int] = mapped_column(Integer, default=1)
    wall_thickness: Mapped[float | None] = mapped_column(Double, nullable=True)
    doors: Mapped[int] = mapped_column(Integer, default=0)
    windows: Mapped[int] = mapped_column(Integer, default=0)
    area_override: Mapped[float | None] = mapped_column(Double, nullable=True)
    pos_x: Mapped[float | None] = mapped_column(Double, nullable=True)
    pos_y: Mapped[float | None] = mapped_column(Double, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="rooms")


class FloorPlan(Base):
    __tablename__ = "floor_plan_files"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    owner_id: Mapped[str] = mapped_column(UUIDStr)
    original_name: Mapped[str] = mapped_column(String)
    content_type: Mapped[str] = mapped_column(String)
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String)  # the file itself lives in Storage, not in the database
    width_px: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_px: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scale_m_per_px: Mapped[float | None] = mapped_column(Double, nullable=True)
    calibration: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="floorplans")


class Material(Base):
    """Catalogue entry. owner_id NULL = shared catalogue (read-only for users, maintained by Admins)."""

    __tablename__ = "materials"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    owner_id: Mapped[str | None] = mapped_column(UUIDStr, nullable=True)
    estimate_key: Mapped[str] = mapped_column(String)  # which estimate line it can supply
    name: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String)
    brand: Mapped[str] = mapped_column(String, default="")
    grade: Mapped[str] = mapped_column(String, default="")
    specification: Mapped[str] = mapped_column(String, default="")
    durability_notes: Mapped[str] = mapped_column(String, default="")
    unit: Mapped[str] = mapped_column(String)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)  # no longer offered; kept for old estimates
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    prices: Mapped[list[PriceRecord]] = relationship(back_populates="material", cascade="all, delete-orphan", order_by="PriceRecord.updated_at.desc()")


class PriceRecord(Base):
    __tablename__ = "material_price_records"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    material_id: Mapped[str] = mapped_column(ForeignKey("materials.id", ondelete="CASCADE"))
    owner_id: Mapped[str | None] = mapped_column(UUIDStr, nullable=True)
    unit_price: Mapped[float] = mapped_column(Double)
    currency: Mapped[str] = mapped_column(String, default="INR")
    supplier: Mapped[str] = mapped_column(String, default="")
    location: Mapped[str] = mapped_column(String, default="")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_by: Mapped[str | None] = mapped_column(UUIDStr, nullable=True)  # the Admin who last set a shared market price

    material: Mapped[Material] = relationship(back_populates="prices")


class Estimate(Base):
    __tablename__ = "project_estimates"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    owner_id: Mapped[str] = mapped_column(UUIDStr)
    summary: Mapped[dict] = mapped_column(JSONB, default=dict)
    geometry: Mapped[dict] = mapped_column(JSONB, default=dict)
    assumptions: Mapped[dict] = mapped_column(JSONB, default=dict)
    warnings: Mapped[list] = mapped_column(JSONB, default=list)
    total_material_cost: Mapped[float] = mapped_column(Double, default=0.0)
    total_area_sqm: Mapped[float] = mapped_column(Double, default=0.0)
    currency: Mapped[str] = mapped_column(String, default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="estimates")
    items: Mapped[list[EstimateItemRow]] = relationship(back_populates="estimate", cascade="all, delete-orphan", order_by="EstimateItemRow.position")
    recommendations: Mapped[list[Recommendation]] = relationship(back_populates="estimate", cascade="all, delete-orphan", order_by="Recommendation.position")


class EstimateItemRow(Base):
    __tablename__ = "estimate_items"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    estimate_id: Mapped[str] = mapped_column(ForeignKey("project_estimates.id", ondelete="CASCADE"))
    owner_id: Mapped[str] = mapped_column(UUIDStr)
    position: Mapped[int] = mapped_column(Integer, default=0)
    data: Mapped[dict] = mapped_column(JSONB)  # one serialised estimate line

    estimate: Mapped[Estimate] = relationship(back_populates="items")


class Recommendation(Base):
    __tablename__ = "optimization_recommendations"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    estimate_id: Mapped[str] = mapped_column(ForeignKey("project_estimates.id", ondelete="CASCADE"))
    owner_id: Mapped[str] = mapped_column(UUIDStr)
    position: Mapped[int] = mapped_column(Integer, default=0)
    data: Mapped[dict] = mapped_column(JSONB)

    estimate: Mapped[Estimate] = relationship(back_populates="recommendations")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(UUIDStr, primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    owner_id: Mapped[str] = mapped_column(UUIDStr)
    estimate_id: Mapped[str | None] = mapped_column(ForeignKey("project_estimates.id", ondelete="SET NULL"), nullable=True)
    file_name: Mapped[str] = mapped_column(String)
    storage_key: Mapped[str] = mapped_column(String)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    total_cost: Mapped[float] = mapped_column(Double, default=0.0)
    currency: Mapped[str] = mapped_column(String, default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="reports")
