"""Input limits in one place. frontend/src/lib/limits.ts holds the SAME numbers (tests/test_limits.py fails if they drift apart).

The database CHECK constraints are deliberately looser than these: tightening a limit here never needs a database change.
"""

# text
PROJECT_NAME = 60
DESCRIPTION = 500
OWNER_NAME = 60
LOCATION = 80
ROOM_NAME = 40
PERSON_NAME = 60
CITY = 80
MATERIAL_NAME = 80
CATEGORY = 40
BRAND = 50
GRADE = 40
SPECIFICATION = 300
NOTES = 300
UNIT = 20
SUPPLIER = 60
PRICE_LOCATION = 60

# numbers
MAX_FLOORS = 30
MAX_ROOMS = 200
MIN_DIM, MAX_DIM = 1.0, 200.0  # building length / width in metres
MIN_ROOM_DIM, MAX_ROOM_DIM = 0.5, 50.0
MIN_HEIGHT, MAX_HEIGHT = 2.0, 6.0  # floor-to-ceiling, metres
MIN_WALL, MAX_WALL = 0.05, 0.6
MIN_SLAB, MAX_SLAB = 0.05, 0.5
MAX_DOORS_PER_ROOM = 6
MAX_WINDOWS_PER_ROOM = 10
MAX_AREA = 100_000.0  # m2
MAX_BUDGET = 10_000_000_000.0
MAX_UNIT_PRICE = 1_000_000.0
MAX_WASTAGE_PCT = 50.0
MAX_EXTRA = 1_000_000_000.0  # one extra-cost value / planned quantity
MAX_ASSUMPTION = 100_000.0


# ---- which characters text fields accept: letters (any language), spaces and the extra characters listed here; digits only where allowed.
# A value must also contain at least one letter, so "12345" or "@@@" is never a name. frontend/src/lib/limits.ts repeats this table.
TEXT_KINDS = {
    "person": (".'-", False),  # names of people: no digits
    "title": (".,'&+-", True),  # project, room, supplier, brand, category names
    "place": (".,-", True),  # city / location
    "material": (".,'&+-()/", True),  # material names
    "grade": (".,-/+()", True),
    "unit": ("()./-³²", True),
}
TEXT_HELP = {
    "person": "letters, spaces and . ' - only",
    "title": "letters, numbers, spaces and . , ' & + - only",
    "place": "letters, numbers, spaces and . , - only",
    "material": "letters, numbers, spaces and . , ' & + - ( ) / only",
    "grade": "letters, numbers, spaces and . , - / + ( ) only",
    "unit": "letters, numbers, spaces and ( ) . / - only",
}


def text_problem(kind: str, value: str) -> str | None:
    """None when `value` is acceptable, else a short message that says what to change."""
    extra, digits = TEXT_KINDS[kind]
    if value == "":
        return None
    for ch in value:
        if not (ch.isalpha() or ch == " " or ch in extra or (digits and ch.isdigit())):
            return f"Use {TEXT_HELP[kind]}."
    if not any(ch.isalpha() for ch in value):
        return "Include at least one letter."
    return None
