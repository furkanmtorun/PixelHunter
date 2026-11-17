"""Unit tests for the pure scoring rules."""

from app.config import HITS_TO_WIN, MAX_COMBO_POINTS, SCORE_TO_WIN
from app.rules import has_won, points_for_combo, register_hit, register_miss


def test_combo_curve() -> None:
    assert points_for_combo(1) == 1
    assert points_for_combo(2) == 99
    assert points_for_combo(3) == 200
    assert points_for_combo(5) == 400
    assert points_for_combo(6) == MAX_COMBO_POINTS
    assert points_for_combo(50) == MAX_COMBO_POINTS


def test_hit_and_miss_bookkeeping() -> None:
    class FakePlayer:
        score = 0
        combo = 0
        hits_on_me: set[int] = set()
        misses_on_me: set[int] = set()

    guesser, target = FakePlayer(), FakePlayer()
    target.hits_on_me = set()
    target.misses_on_me = set()

    assert register_hit(guesser, target, 3) == 1
    assert register_hit(guesser, target, 4) == 99
    assert target.hits_on_me == {3, 4}
    assert guesser.score == 100

    register_miss(guesser, target, 5)
    assert guesser.score == 99
    assert guesser.combo == 0
    assert target.misses_on_me == {5}


def test_win_conditions() -> None:
    class FakePlayer:
        def __init__(self) -> None:
            self.score = 0
            self.hits_on_me: set[int] = set()

    guesser = FakePlayer()
    target = FakePlayer()
    assert has_won(guesser, target) is False

    target.hits_on_me = set(range(HITS_TO_WIN))
    assert has_won(guesser, target) is True

    target.hits_on_me = set()
    guesser.score = SCORE_TO_WIN
    assert has_won(guesser, target) is True
