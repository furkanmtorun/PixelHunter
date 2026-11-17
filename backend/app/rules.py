"""Pure scoring and win-condition helpers.

Keeping these free of I/O makes the rules trivial to unit test.
"""

from __future__ import annotations

from .config import (
    COMBO_STEP_POINTS,
    FIRST_HIT_POINTS,
    HITS_TO_WIN,
    MAX_COMBO_POINTS,
    MISS_POINTS,
    SCORE_TO_WIN,
    SECOND_HIT_POINTS,
)
from .models import Player


def points_for_combo(combo: int) -> int:
    """Points awarded for the Nth consecutive hit."""
    if combo <= 1:
        return FIRST_HIT_POINTS
    if combo == 2:
        return SECOND_HIT_POINTS
    return min(MAX_COMBO_POINTS, (combo - 1) * COMBO_STEP_POINTS)


def register_hit(guesser: Player, target: Player, index: int) -> int:
    """Record a hit and return the points the guesser earned."""
    target.hits_on_me.add(index)
    guesser.combo += 1
    points = points_for_combo(guesser.combo)
    guesser.score += points
    return points


def register_miss(guesser: Player, target: Player, index: int) -> None:
    """Record a miss, reset the combo, and deduct a point."""
    target.misses_on_me.add(index)
    guesser.combo = 0
    guesser.score += MISS_POINTS


def has_won(guesser: Player, target: Player) -> bool:
    """True when the guesser has reached either win condition."""
    return len(target.hits_on_me) >= HITS_TO_WIN or guesser.score >= SCORE_TO_WIN
