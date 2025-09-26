"""
Functionalities for equity calculation and luck score.
"""

from pathlib import Path

from .card import Card

class EquityResult:
    """
    Result of single equity calculation.
    """

    def __init__(
        self, cards_people: list[tuple[Card, Card]], cards_community: list[Card]
    ) -> None: ...
    def get_equity_py(self, player_index: int) -> float:
        """
        Get equity of given player index.
        """
        ...
    def never_lost(self, player_index: int) -> bool:
        """
        Return whether the player never lost in all possible outcomes.
        """
        ...
    def get_winlosses_py(self, player_index: int) -> tuple[list[int], int]:
        """
        Get (wins, losses) of given player index.
        - `wins[i]`: Number of times the player wins with `i`-way ties.
        - `losses`: Number of times the player loses.
        """
        ...

class LuckCalculator:
    """
    Luck calculator using equity values and results.
    """

    def __init__(self) -> None: ...
    def add_result_py(self, equity: float, actual: float) -> None:
        """
        Add a result with given equity and whether the player won.
        """
        ...
    def luck_score_py(self) -> float:
        """
        Get the Luck-score of the results.
        """
        ...
    def tails_py(self) -> tuple[float, float, float]:
        """
        Get the tail p-values; Upper-tail, lower-tail, and two-sided p-values.
        """
        ...

class HUPreflopEquityCache:
    """
    Pre-flop equity cache for heads-up situations.
    """

    def __init__(self, path: Path) -> None: ...
    def get_winlose_py(
        self, hand1: tuple[Card, Card], hand2: tuple[Card, Card]
    ) -> tuple[int, int, int]:
        """
        Get win/lose/tie counts of hand1 against hand2.
        Returns None if not found in cache.
        """
        ...
