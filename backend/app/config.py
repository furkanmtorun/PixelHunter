"""Game rules and tuning constants shared by the whole backend.

Each mode's `matrix` is (columns, rows). The remaining keys describe how many
pixels a player hides and the two ways to win.
"""

DEFAULT_MODE = "hard"
DEFAULT_COLOR = "#1a1a2e"

# Phases
STATE_WAITING = "WAITING"
STATE_PLACEMENT = "PLACEMENT"
STATE_PLAYING = "PLAYING"
STATE_GAME_OVER = "GAME_OVER"

MODES = {
    "easy": {
        "mode_name": "Easy",
        "mode_difficulty": "easy",
        "matrix": (3, 3),
        "max_pixels": 4,
        "n_hit_to_win": 4,
        "scores_to_win": 600,
    },
    "medium": {
        "mode_name": "Medium",
        "mode_difficulty": "medium",
        "matrix": (6, 6),
        "max_pixels": 12,
        "n_hit_to_win": 12,
        "scores_to_win": 1000,
    },
    "hard": {
        "mode_name": "Hard",
        "mode_difficulty": "hard",
        "matrix": (10, 10),
        "max_pixels": 20,
        "n_hit_to_win": 11,
        "scores_to_win": 1000,
    },
}

# Scoring shared by every mode
FIRST_HIT_POINTS = 1
SECOND_HIT_POINTS = 99
COMBO_STEP_POINTS = 100
MAX_COMBO_POINTS = 500
MISS_POINTS = -1

# Input limits (keeps lobby payloads and UI text bounded)
USERNAME_MAX_LENGTH = 15
ROOM_NAME_MAX_LENGTH = 40


def get_mode(mode: str | None) -> dict:
    """Return a mode's settings, falling back to the default mode."""
    return MODES.get(mode or DEFAULT_MODE, MODES[DEFAULT_MODE])
