"""
Contains data structures related to cards, poker hands and ranks.
"""

from enum import Enum
from enum import auto as enumauto

class CardShape(Enum):
    """
    Enumeration of card shapes(suits).
    """

    Spade = enumauto()
    Heart = enumauto()
    Diamond = enumauto()
    Club = enumauto()

class CardNumber(Enum):
    """
    Enumeration of card numbers(ranks).
    """

    Two = enumauto()
    Three = enumauto()
    Four = enumauto()
    Five = enumauto()
    Six = enumauto()
    Seven = enumauto()
    Eight = enumauto()
    Nine = enumauto()
    Ten = enumauto()
    Jack = enumauto()
    Queen = enumauto()
    King = enumauto()
    Ace = enumauto()

    def __int__(self) -> int: ...
    @staticmethod
    def all_py() -> list[CardNumber]: ...

class Card:
    """
    A playing card.
    """

    def __init__(self, card_str: str) -> None: ...
    @property
    def number(self) -> CardNumber:
        """
        Get the card number.
        """
        ...
    @property
    def shape(self) -> CardShape:
        """
        Get the card shape.
        """
        ...

class HandRank(Enum):
    """
    Enumeration of hand ranks.
    """

    HighCard = enumauto()
    OnePair = enumauto()
    TwoPair = enumauto()
    Triple = enumauto()
    Straight = enumauto()
    Flush = enumauto()
    FullHouse = enumauto()
    Quads = enumauto()
    StraightFlush = enumauto()

    def __lt__(self, other: "HandRank") -> bool: ...
    def __le__(self, other: "HandRank") -> bool: ...
    def __gt__(self, other: "HandRank") -> bool: ...
    def __ge__(self, other: "HandRank") -> bool: ...
    def __eq__(self, other: object) -> bool: ...
    def __ne__(self, other: object) -> bool: ...
    def numerize_py(self) -> tuple[int, int]:
        """
        Numerize the hand rank.
        """
        ...
    @staticmethod
    def find_best5_py(cards: list[Card]) -> tuple[list[Card], HandRank]:
        """
        Find the best 5-card hand from the given cards.
        """
        ...
