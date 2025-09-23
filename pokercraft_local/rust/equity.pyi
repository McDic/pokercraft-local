"""
Functionalities for equity calculation and luck score.
"""

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
    def luck_score_py(self) -> float | None:
        """
        Get the Luck-score of the results.
        """
        ...
    def tails_py(self) -> tuple[float, float, float] | None:
        """
        Get the tail p-values; Upper-tail, lower-tail, and two-sided p-values.
        """
        ...
