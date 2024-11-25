from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from enum import auto as enumauto


class PokerGameType(Enum):
    """
    Enumeration of game types.
    Not used currently, will use in future.
    """

    NLH = enumauto()
    PLO = enumauto()
    SD = enumauto()
    Unknown = enumauto()


@dataclass(frozen=True, slots=True)
class TournamentSummary:
    """
    Represents a tournament result summary.
    """

    id: int
    name: str
    buy_in_pure: float
    rake: float
    total_prize_pool: float
    start_time: datetime  # timezone is local
    my_rank: int
    total_players: int
    my_prize: float
    my_entries: int = 1


class Currency(Enum):
    """
    Enumeration of currencies.
    """

    USD = ("$", 1.0)
    CNY = ("¥", 7.25)
    THB = ("฿", 34.61)
    VND = ("₫", 25420.00)
    PHP = ("₱", 58.98)
