"""Request and response shapes. These rules are checked before anything reaches the database; the database's own CHECK constraints
are a second, looser net (see the migration)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

BuildingType = Literal["residential", "commercial", "extension", "other"]
RoomType = Literal["living", "bedroom", "kitchen", "dining", "bathroom", "study", "store", "balcony", "corridor", "staircase", "office", "other"]

MAX_ROOMS = 500


class _In(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False, extra="forbid")


class RoomIn(_In):
    name: str = Field(min_length=1, max_length=80)
    room_type: RoomType = "other"
    length: float = Field(gt=0, le=1000)
    width: float = Field(gt=0, le=1000)
    height: float = Field(default=3.0, ge=2, le=15)
    floor_number: int = Field(default=1, ge=1, le=50)
    wall_thickness: float | None = Field(default=None, gt=0, le=3)
    doors: int = Field(default=0, ge=0, le=50)
    windows: int = Field(default=0, ge=0, le=50)
    area_override: float | None = Field(default=None, gt=0, le=1_000_000)
    pos_x: float | None = Field(default=None, ge=0, le=1000)
    pos_y: float | None = Field(default=None, ge=0, le=1000)


class RoomOut(BaseModel):
    """A stored room. Plain types on purpose: the input rules above are not re-applied to rows already in the database."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    room_type: str
    length: float
    width: float
    height: float
    floor_number: int
    wall_thickness: float | None
    doors: int
    windows: int
    area_override: float | None
    pos_x: float | None
    pos_y: float | None
    created_at: datetime

    @computed_field  # net floor area in m2 (the manual override when set)
    @property
    def area(self) -> float:
        return self.area_override or self.length * self.width


class ProjectIn(_In):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    owner_name: str = Field(default="", max_length=120)
    building_type: BuildingType = "residential"
    location: str = Field(default="", max_length=120)
    floors: int = Field(default=1, ge=1, le=50)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    budget: float | None = Field(default=None, gt=0, lt=1e13)
    length: float = Field(gt=0, le=1000)
    width: float = Field(gt=0, le=1000)
    height: float = Field(default=3.0, ge=2, le=15)
    wall_thickness: float = Field(default=0.23, ge=0.05, le=1)
    slab_thickness: float = Field(default=0.15, ge=0.05, le=1)
    built_up_area: float | None = Field(default=None, gt=0, le=1_000_000)


class ProjectCreate(ProjectIn):
    rooms: list[RoomIn] = Field(default_factory=list, max_length=MAX_ROOMS)

    @model_validator(mode="after")
    def _rooms_fit_the_floors(self):
        check_floors(self.rooms, self.floors)
        return self


class ProjectUpdate(ProjectIn):
    pass


class RoomsReplace(_In):
    rooms: list[RoomIn] = Field(default_factory=list, max_length=MAX_ROOMS)


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    owner_name: str
    building_type: str
    location: str
    floors: int
    currency: str
    budget: float | None
    length: float
    width: float
    height: float
    wall_thickness: float
    slab_thickness: float
    built_up_area: float | None
    created_at: datetime
    updated_at: datetime
    room_count: int
    floor_area: float  # footprint of one floor in m2 (the manual override when set)
    total_built_up_area: float  # footprint x floors


class ProjectDetail(ProjectOut):
    rooms: list[RoomOut]


class ProfileOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str


class ProfileUpdate(_In):
    full_name: str = Field(max_length=120)


def check_floors(rooms, floors: int) -> None:
    """Every room must sit on one of the project's floors."""
    for r in rooms:
        if r.floor_number > floors:
            raise ValueError(f"Room '{r.name}' is on floor {r.floor_number}, but the project has {floors} floor(s).")
