"""Table mappings. The tables themselves are created by supabase/migrations/*.sql, never by the application."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Double, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    full_name: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rooms: Mapped[list[Room]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="(Room.floor_number, Room.created_at)",
    )


class Room(Base):
    __tablename__ = "project_rooms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid)
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
