"""Unit tests for the pure scoring rules."""

from app.config import MAX_COMBO_POINTS, MODES
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


def test_win_conditions_per_mode() -> None:
    class FakePlayer:
        def __init__(self) -> None:
            self.score = 0
            self.hits_on_me: set[int] = set()

    for mode in MODES.values():
        guesser = FakePlayer()
        target = FakePlayer()
        assert has_won(guesser, target, mode) is False

        target.hits_on_me = set(range(mode["n_hit_to_win"] - 1))
        assert has_won(guesser, target, mode) is False

        target.hits_on_me.add(mode["n_hit_to_win"] - 1)
        assert has_won(guesser, target, mode) is True

        target.hits_on_me = set()
        guesser.score = mode["scores_to_win"] - 1
        assert has_won(guesser, target, mode) is False

        guesser.score = mode["scores_to_win"]
        assert has_won(guesser, target, mode) is True


def test_mode_targets_are_reachable() -> None:
    for mode in MODES.values():
        columns, rows = mode["matrix"]
        hidden = mode["max_pixels"]
        assert hidden <= columns * rows
        assert mode["n_hit_to_win"] <= hidden
