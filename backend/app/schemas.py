"""Request and response shapes. These rules are checked before anything reaches the database; the database's own CHECK constraints
are a second, looser net (see the migration)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

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
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime
    # estimate settings and the saved 3D layout
    assumptions: dict = Field(default_factory=dict)
    wastage: dict = Field(default_factory=dict)
    material_selections: dict = Field(default_factory=dict)
    extra_costs: dict = Field(default_factory=dict)
    purchase_quantities: dict = Field(default_factory=dict)
    layout: dict | None = None
    room_count: int
    floor_area: float  # footprint of one floor in m2 (the manual override when set)
    total_built_up_area: float  # footprint x floors
    latest_total_cost: float | None = None
    has_estimate: bool = False


class FloorPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    original_name: str
    content_type: str
    size_bytes: int
    width_px: int | None = None
    height_px: int | None = None
    scale_m_per_px: float | None = None
    calibration: dict | None = None
    created_at: datetime


class ProjectDetail(ProjectOut):
    rooms: list[RoomOut]
    floorplans: list[FloorPlanOut] = Field(default_factory=list)


class ProjectConfigUpdate(_In):
    """Estimate settings: assumptions, wastage, chosen materials, extra costs and planned purchases."""

    assumptions: dict | None = None
    wastage: dict[str, float] | None = None
    material_selections: dict[str, str | None] | None = None
    extra_costs: dict | None = None
    purchase_quantities: dict[str, float | None] | None = None


class ProfileOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    default_city: str = ""
    default_wastage: dict = Field(default_factory=dict)


class ProfileUpdate(_In):
    full_name: str = Field(max_length=120)
    default_city: str | None = Field(default=None, max_length=120)
    default_wastage: dict[str, float] | None = None


def check_floors(rooms, floors: int) -> None:
    """Every room must sit on one of the project's floors."""
    for r in rooms:
        if r.floor_number > floors:
            raise ValueError(f"Room '{r.name}' is on floor {r.floor_number}, but the project has {floors} floor(s).")


# ---------------------------------------------------------------------------------------------------- floor plans
class CalibrationIn(_In):
    x1: float
    y1: float
    x2: float
    y2: float
    real_length_m: float = Field(gt=0, le=1000)


# ---------------------------------------------------------------------------------------------------- materials and prices
class MaterialBase(_In):
    estimate_key: str
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=80)
    brand: str = Field(default="", max_length=120)
    grade: str = Field(default="", max_length=120)
    specification: str = Field(default="", max_length=2000)
    durability_notes: str = Field(default="", max_length=2000)
    unit: str = Field(min_length=1, max_length=30)

    @field_validator("estimate_key")
    @classmethod
    def _known_key(cls, v: str) -> str:
        from app.services.estimation import ITEM_ORDER

        if v not in ITEM_ORDER:
            raise ValueError(f"must be one of {ITEM_ORDER}")
        return v


class MaterialCreate(MaterialBase):
    unit_price: float | None = Field(default=None, ge=0, lt=1e12)
    supplier: str = Field(default="", max_length=160)
    location: str = Field(default="", max_length=160)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")


class MaterialUpdate(MaterialBase):
    pass


class MaterialOut(BaseModel):
    id: uuid.UUID
    estimate_key: str
    name: str
    category: str
    brand: str
    grade: str
    specification: str
    durability_notes: str
    unit: str
    is_sample: bool
    owner_id: uuid.UUID | None = None
    editable: bool = False
    unit_price: float | None = None
    currency: str | None = None
    supplier: str = ""
    location: str = ""
    price_is_sample: bool = False
    price_id: uuid.UUID | None = None
    last_updated: datetime | None = None
    created_at: datetime


class PriceCreate(_In):
    material_id: uuid.UUID
    unit_price: float = Field(ge=0, lt=1e12)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    supplier: str = Field(default="", max_length=160)
    location: str = Field(default="", max_length=160)


class PriceUpdate(_In):
    unit_price: float = Field(ge=0, lt=1e12)
    supplier: str = Field(default="", max_length=160)
    location: str = Field(default="", max_length=160)


class PriceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    material_id: uuid.UUID
    unit_price: float
    currency: str
    supplier: str
    location: str
    is_sample: bool
    updated_at: datetime


# ---------------------------------------------------------------------------------------------------- estimates and reports
class EstimateRequest(_In):
    persist: bool = True
    # optional what-if overrides (never saved to the project)
    assumptions: dict | None = None
    wastage: dict[str, float] | None = None
    material_selections: dict[str, str | None] | None = None
    extra_costs: dict | None = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    file_name: str
    size_bytes: int
    total_cost: float
    currency: str
    created_at: datetime


# ---------------------------------------------------------------------------------------------------- saved 3D layout
# These shapes are what the Studio saves with a project. Unknown fields are dropped (plain BaseModel), sizes are bounded.
class OpeningIn(BaseModel):
    id: str = Field(max_length=96)
    kind: Literal["door", "window"]
    floor: int = Field(ge=1, le=100)
    orientation: Literal["x", "z"]
    line: float = Field(ge=-1000, le=1000)
    center: float = Field(ge=-1000, le=1000)
    width: float = Field(gt=0.2, le=6)
    height: float = Field(gt=0.2, le=4)
    sill: float = Field(ge=0, le=3)
    room_id: str = Field(max_length=48)
    into: Literal[1, -1] = 1
    entrance: bool = False


class FurnitureItemIn(BaseModel):
    id: str = Field(max_length=96)
    room_id: str = Field(max_length=48)
    type: str = Field(max_length=32)
    cx: float = Field(ge=-1000, le=1000)
    cz: float = Field(ge=-1000, le=1000)
    w: float = Field(gt=0.01, le=12)
    d: float = Field(gt=0.01, le=12)  # a wall mirror is only 4 cm deep
    facing: Literal["N", "S", "E", "W"] = "N"


class FurnitureIn(BaseModel):
    items: list[FurnitureItemIn] = Field(default_factory=list, max_length=1500)
    room_sigs: dict[str, str] = Field(default_factory=dict)


class DoorSizeIn(BaseModel):
    w: float = Field(gt=0.2, le=6)
    h: float = Field(gt=0.2, le=4)
    exterior: bool = False


class WindowSizeIn(BaseModel):
    w: float = Field(gt=0.2, le=6)
    h: float = Field(gt=0.2, le=4)


class LayoutSummaryIn(BaseModel):
    doors: list[DoorSizeIn] = Field(default_factory=list, max_length=600)
    windows: list[WindowSizeIn] = Field(default_factory=list, max_length=1200)


class LayoutIn(BaseModel):
    """Everything the Studio persists besides the rooms. `openings` / `furniture` of None mean "fully automatic"."""

    version: int = 1
    signature: str = Field(max_length=200000)
    settings: dict = Field(default_factory=dict)
    openings: list[OpeningIn] | None = Field(default=None, max_length=1200)
    furniture: FurnitureIn | None = None
    summary: LayoutSummaryIn = Field(default_factory=LayoutSummaryIn)

    @field_validator("settings")
    @classmethod
    def _settings_small(cls, v: dict) -> dict:
        if len(v) > 30 or any(not isinstance(k, str) or len(k) > 40 for k in v):
            raise ValueError("too many or too long settings")
        return {k: x for k, x in v.items() if isinstance(x, (bool, int, float, str))}
