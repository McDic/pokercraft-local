import logging
import math
import typing
import warnings
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from forex_python.converter import CurrencyRates

from .rust import card, equity

Card = card.Card

logger = logging.getLogger(__name__)


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

    def name_with_date(self) -> str:
        """
        Returns the name of this tourney with date.
        Format: `name (YYYY-MM-DD HH:MM)`
        """
        return "%s (%s)" % (
            self.name,
            self.start_time.strftime("%Y-%m-%d %H:%M"),
        )

    @property
    def time_of_week(self) -> tuple[int, int]:
        """
        Returns the time of this tourney in week.
        Format: `(day of week: [0, 7), hour/minute of day: [0, 1440))`

        For weekdays, `0` is Monday and `6` is Sunday.
        For hour/minute of day, `0` is `00:00` and `1439` is `23:59`.
        """
        return (
            self.start_time.weekday(),
            self.start_time.hour * 60 + self.start_time.minute,
        )

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


@dataclass
class BetAction:
    """
    Represents a betting action.
    """

    player_id: str  # Player ID or Hero
    action: typing.Literal["fold", "check", "call", "bet", "raise", "ante"]
    amount: int  # Amount of chips additionally put in this action
    is_all_in: bool


@dataclass
class HandHistory:
    """
    Represents a hand history.
    """

    id: str
    tournament_name: str | None
    level: int
    sb: int
    bb: int
    dt: datetime  # timezone is local

    seats: dict[
        int, tuple[str, int]
    ]  # Seat number -> Player ID or Hero & initial chips
    known_cards: dict[str, tuple[Card, Card]]  # Player ID or Hero -> hole cards
    wons: dict[str, int]  # Player ID or Hero -> amount won in this hand

    community_cards: list[Card]
    actions_preflop: list[BetAction]
    actions_flop: list[BetAction]
    actions_turn: list[BetAction]
    actions_river: list[BetAction]
    uncalled_returned: tuple[str, int] | None  # (Player ID or Hero, amount)

    def how_much_won(self, player_id: str) -> int:
        """
        Returns how much the given player won in this hand.
        """
        return self.wons.get(player_id, 0)

    def total_pot(self) -> int:
        """
        Returns the total pot size of this hand.
        """
        return sum(self.wons.values())

    def calculate_equity_arbitrary(
        self, *player_ids: str
    ) -> dict[typing.Literal["preflop", "flop", "turn", "river"], dict[str, float]]:
        """
        Calculate equity for each player who has known cards.
        """
        if not player_ids:
            raise ValueError("At least one player ID must be given")
        for player_id in player_ids:
            if player_id not in self.known_cards:
                raise ValueError("Player %s does not have known cards" % player_id)
        cards_people: list[tuple[str, tuple[Card, Card]]] = [
            (player_id, self.known_cards[player_id]) for player_id in player_ids
        ]

        def get_equities(community: list[Card]) -> dict[str, float]:
            """
            Local helper function to get equities with given community cards.
            """
            equity_result = equity.EquityResult([p[1] for p in cards_people], community)
            return {
                p[0]: equity_result.get_equity_py(i) for i, p in enumerate(cards_people)
            }

        result: dict[
            typing.Literal["preflop", "flop", "turn", "river"], dict[str, float]
        ] = {"preflop": get_equities([])}
        if len(self.community_cards) >= 3:
            result["flop"] = get_equities(self.community_cards[:3])
        if len(self.community_cards) >= 4:
            result["turn"] = get_equities(self.community_cards[:4])
        if len(self.community_cards) >= 5:
            result["river"] = get_equities(self.community_cards[:5])
        return result


def get_exchange_rate_raw(
    to_currency: str,
    default: float,
    from_currency: str = "USD",
) -> float:
    """
    Get exchange rate from `from_currency` to `to_currency`.
    """
    try:
        logger.info("Getting exchange rate: %s -> %s" % (from_currency, to_currency))
        return CurrencyRates().get_rate(from_currency, to_currency)
    except Exception as err:
        warnings.warn(
            "Failed to fetch exchange rate(%s -> %s) with reason: [%s] %s"
            % (from_currency, to_currency, type(err), err)
        )
        return default


class Currency(Enum):
    """
    Enumeration of currencies.
    """

    USD = "$"
    CNY = "¥"
    THB = "฿"
    VND = "₫"
    PHP = "₱"
    KRW = "₩"


class CurrencyRateConverter:
    """
    Represent a currency rate converter.
    """

    def __init__(self, update_from_forex: bool = True) -> None:
        self._usd_rates: dict[Currency, float] = {
            Currency.USD: 1.0,  # default rates
            Currency.CNY: 7.25,
            Currency.THB: 34.61,
            Currency.VND: 25420.00,
            Currency.PHP: 58.98,
            Currency.KRW: 1399.58,
        }
        if update_from_forex:
            for currency in Currency:
                if currency is Currency.USD:
                    continue
                self._usd_rates[currency] = get_exchange_rate_raw(
                    currency.name, self._usd_rates[currency]
                )

    def convert(
        self,
        to_currency: Currency,
        *,
        from_currency: Currency = Currency.USD,
        amount: float = 1.0,
    ) -> float:
        """
        Convert given amount from `from_currency` to `to_currency`.
        """
        return amount * self._usd_rates[from_currency] / self._usd_rates[to_currency]
