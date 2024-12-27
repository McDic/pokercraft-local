import math
import typing
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


class TournamentBrand(Enum):
    """
    Enumeration of tournament brands.
    """

    GGMasters = ("GGMasters", 0)
    Zodiac = ("Zodiac", 0)
    BountyHunters = ("Bounty Hunters", -2)
    SpeedRacer = ("Speed Racer", -1)
    GlobalMillion = ("Global Million", 0)
    MicroFestival = ("microFestival", 1)
    FlipAndGo = ("Flip & Go", 0)
    APL = ("APL", 1)
    WSOP = ("WSOP", 2)
    APT = ("APT", 1)
    KSOP = ("KSOP", 1)
    DailyGames = ("Daily", -1)
    Unknown = ("Unknown", -999)

    @classmethod
    def find(cls, name: str) -> "TournamentBrand":
        """
        Find a brand by name.
        """
        current_brand = cls.Unknown
        for brand in cls:
            if brand.value[0] in name and brand.value[1] > current_brand.value[1]:
                current_brand = brand
        return current_brand


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

    def __hash__(self) -> int:
        return hash(self.id)

    def __eq__(self, other: typing.Any) -> bool:
        return isinstance(other, TournamentSummary) and self.id == other.id

    def sorting_key(self):
        """
        Returns the sorting key.
        """
        return (self.start_time, self.id)

    @property
    def buy_in(self) -> float:
        """
        Returns the total buy in.
        """
        return self.buy_in_pure + self.rake

    @property
    def profit(self) -> float:
        """
        Returns the profit.
        """
        return self.my_prize - self.buy_in * self.my_entries

    @property
    def rre(self) -> float:
        """
        Returns RRE(Relative Return with re-Entries). For examples,
        - $3 prize from a $1 buy-in returns `3.0`
        - No prize from a $2 buy-in returns `0.0`
        - $5 prize from a $1 buy-in with 3 re-entries returns `1.25`

        For freerolls, this returns `NaN`.
        """
        if self.buy_in > 0:
            return self.my_prize / self.buy_in / self.my_entries
        else:
            return math.nan

    @property
    def rrs(self) -> list[float]:
        """
        Returns list of relative returns.
        Unlike `self.rre`, this adds `-1` on each
        element of the result. For examples,
        - $3 prize from a $1 buy-in returns `[2.0]`
        - No prize from a $2 buy-in returns `[-1.0]`
        - $5 prize from a $1 buy-in with 3 re-entries
            returns `[-1.0, -1.0, -1.0, 4.0]`
        - No prize from a $1 buy-in with 5 re-entries
            returns `[-1.0, -1.0, -1.0, -1.0, -1.0, -1.0]`

        For freerolls, this returns an empty list.
        """
        if self.buy_in > 0:
            return [-1.0 for _ in range(self.my_entries - 1)] + [
                self.my_prize / self.buy_in - 1.0
            ]
        else:
            return []

    def __str__(self) -> str:
        return "%d,%s,%s,%.2f,%.2f,%d,#%d" % (
            self.id,
            self.start_time.strftime("%Y%m%d %H%M%S"),
            self.name.replace(",", " "),
            self.buy_in,
            self.my_prize,
            self.my_entries,
            self.my_rank,
        )


class Currency(Enum):
    """
    Enumeration of currencies.
    """

    USD = ("$", 1.0)
    CNY = ("¥", 7.25)
    THB = ("฿", 34.61)
    VND = ("₫", 25420.00)
    PHP = ("₱", 58.98)
    KRW = ("₩", 1399.58)
