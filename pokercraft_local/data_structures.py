import itertools
import logging
import math
import typing
import warnings
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path

from forex_python.converter import CurrencyRates

from .constants import HAND_STAGE_TYPE
from .rust import card, equity

Card = card.Card
HandRank = card.HandRank

logger = logging.getLogger("pokercraft_local.data_structures")

T = typing.TypeVar("T")


@dataclass(frozen=True, kw_only=True, slots=True)
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


@dataclass(frozen=True, kw_only=True, slots=True)
class BetAction:
    """
    Represents a betting action.

    About `amount` field:
    - If the action is "fold" or "check", this is `0`.
    - If the action is "call", this is the amount called.
    - If the action is "bet", this is the amount bet.
    - If the action is "raise", this is the total amount put in
      the pot by this action (not the delta amount raised).
    - If the action is "ante" or "blind", this is the amount posted.
    """

    player_id: str  # Player ID or Hero
    action: typing.Literal["fold", "check", "call", "bet", "raise", "ante", "blind"]
    amount: int
    is_all_in: bool

    def all_in_toggled(self) -> "BetAction":
        """
        Return a `is_all_in` toggled version of `self`.
        """
        return BetAction(
            player_id=self.player_id,
            action=self.action,
            amount=self.amount,
            is_all_in=not self.is_all_in,
        )


@dataclass(kw_only=True, slots=True)  # Frozen removed for convenience
class HandHistory:
    """
    Represents a hand history.
    """

    id: str  # "TM000000"
    tournament_id: int | None
    tournament_name: str | None
    level: int
    sb: int
    bb: int
    dt: datetime  # timezone is local
    button_seat: int
    sb_seat: int | None  # SB seat is optional
    bb_seat: int
    max_seats: int

    seats: dict[int, tuple[str, int]] = field(
        default_factory=dict
    )  # Seat number -> Player ID or Hero & initial chips
    known_cards: dict[str, tuple[Card, Card]] = field(
        default_factory=dict
    )  # Player ID or Hero -> hole cards
    wons: dict[str, int] = field(
        default_factory=dict
    )  # Player ID or Hero -> amount won in this hand

    community_cards: list[Card] = field(default_factory=list)
    actions_preflop: list[BetAction] = field(default_factory=list)
    actions_flop: list[BetAction] = field(default_factory=list)
    actions_turn: list[BetAction] = field(default_factory=list)
    actions_river: list[BetAction] = field(default_factory=list)
    uncalled_returned: tuple[str, int] | None = None  # (Player ID or Hero, amount)
    all_ined: dict[str, typing.Literal["preflop", "flop", "turn", "river"]] = field(
        default_factory=dict
    )  # Player ID or Hero -> street

    def __hash__(self) -> int:
        return hash(self.id)

    def sorting_key(self) -> tuple[int, datetime]:
        """
        Returns the sorting key.
        """
        return (self.tournament_id or 0, self.dt)

    def initial_chips(self, player_id: str) -> int:
        """
        Returns the initial chips of the given player in this hand.
        If non-existing player ID is given, raises `KeyError`.
        """
        for _seat, (pid, chips) in self.seats.items():
            if pid == player_id:
                return chips
        raise KeyError("Player %s is not in this hand" % player_id)

    def get_seat_number(self, player_id: str) -> int:
        """
        Returns the seat number by given player ID.
        If non-existing player ID is given, raises `KeyError`.
        """
        for seat, (pid, _chips) in self.seats.items():
            if pid == player_id:
                return seat
        raise KeyError("Player %s is not in this hand" % player_id)

    def get_offset_from_button(self, player_id: str) -> int:
        """
        Returns the offset of the given player from the button.
        - If player is at button, returns 0.
        - If player is at blind, returns 1(SB) or 2(BB).
        - If player is before the button, returns negative number.
        """
        player_seat = self.get_seat_number(player_id)

        if player_seat == self.sb_seat:
            return 1
        elif player_seat == self.bb_seat:
            return 2

        current_seat: int = self.button_seat
        offset: int = 0
        min_seat, max_seat = min(self.seats), max(self.seats)

        def decrement(seat: int) -> int:
            """
            Return the closest previous seat.
            BTN -> CO -> MP+1 -> MP -> UTG+1 -> UTG -> BB -> SB -> ..
            """
            while True:
                if min_seat >= seat:
                    seat = max_seat
                else:
                    seat -= 1
                if seat in self.seats:
                    return seat

        while True:
            if current_seat == player_seat:
                return offset
            current_seat = decrement(current_seat)
            offset -= 1

    def total_chips_put(self, player_id: str) -> int:
        """
        Returns how much chips the given player put into the pot
        in this hand, including both ante/blinds and normal bets.
        """
        if player_id not in (pid for pid, _chips in self.seats.values()):
            raise ValueError("Player %s is not in this hand" % player_id)

        total_bet: int = 0

        # Count ante separately
        for action in self.actions_preflop:
            if action.action == "ante" and action.player_id == player_id:
                total_bet += action.amount

        # Count bets/calls/raises
        for street in (
            self.actions_preflop,
            self.actions_flop,
            self.actions_turn,
            self.actions_river,
        ):
            latest_bet: int = 0
            for action in street:
                if action.player_id != player_id:
                    continue
                match action.action:
                    case "fold" | "check":
                        pass
                    case "call" | "bet" | "blind":
                        latest_bet += action.amount
                    case "raise":
                        latest_bet = action.amount
            total_bet += latest_bet

        if (
            self.uncalled_returned is not None
            and self.uncalled_returned[0] == player_id
        ):
            total_bet -= self.uncalled_returned[1]

        return total_bet

    def net_profit(self, player_id: str) -> int:
        """
        Returns the net profit of the given player in this hand.
        This is equivalent to `self.wons[player_id] - self.total_chips_put(player_id)`.
        """
        return self.wons.get(player_id, 0) - self.total_chips_put(player_id)

    def preflop_passive_folded(self, player_id: str) -> bool | None:
        """
        Returns `True` if the given player folded without any betting action at preflop.
        This does not counts when the player raised but folded to 3bet.
        If the player is forcibly all-ined by ante or blind, this returns `True`.

        This returns `None` when
        - The player is at BB, but all people before BB folded,
            therefore the player won the pot.
        - The player checked at BB.
        """
        for action in self.actions_preflop:
            if action.action in ("ante", "blind"):
                if action.player_id == player_id and action.is_all_in:
                    return True
            elif action.player_id == player_id:
                match action.action:
                    case "fold":
                        return True
                    case "check":
                        return None
                    case _:
                        return False
        if self.bb_seat == self.get_seat_number(player_id):
            return None
        else:
            raise ValueError(
                "Couldn't find any preflop action for"
                "given player %s (%s %s / %s, actions: %s)"
                % (
                    player_id,
                    self.tournament_name,
                    self.dt,
                    self.id,
                    self.actions_preflop,
                )
            )

    def all_ined_street(
        self, player_id: str
    ) -> typing.Literal["preflop", "flop", "turn", "river", None]:
        """
        Returns the street where the player went all-in, or `None` if not all-in.
        """
        return self.all_ined.get(player_id)

    def showdown_players(self) -> frozenset[str]:
        """
        Returns the list of players who reached showdown.
        """
        players = set(player_id for player_id, _chips in self.seats.values())
        for action in itertools.chain(
            self.actions_preflop,
            self.actions_flop,
            self.actions_turn,
            self.actions_river,
        ):
            if action.action == "fold" and action.player_id in players:
                players.discard(action.player_id)
        return frozenset(players)

    def total_pot(self) -> int:
        """
        Returns the total pot size of this hand.
        """
        return sum(self.wons.values())

    def was_best_hand(self, main_player_id: str) -> int:
        """
        Check if the given player had the best hand against all players
        reaching showdown, assuming this player reached the showdown.

        If the river card or this player's card is unknown, this raises an error.
        Otherwise, this returns:
        - `x >= 0`: The given player had the best hand with `x` other players tied.
        - `-1`: The given player did not have the best hand.
        """
        if main_player_id not in (pid for pid, _chips in self.seats.values()):
            raise ValueError("Player %s is not in this hand" % main_player_id)

        this_player_hand = self.known_cards.get(main_player_id)
        if this_player_hand is None:
            raise ValueError("Unknown cards for player %s" % main_player_id)
        elif len(self.community_cards) < 5:
            raise ValueError("Not enough community cards(River card is unknown)")
        this_player_handrank: HandRank = HandRank.find_best5_py(
            [*self.community_cards, *this_player_hand]
        )[1]

        better_count: int = 0
        tie_count: int = 0
        for pid in self.showdown_players():
            if pid == main_player_id:
                continue
            opponent_handrank = HandRank.find_best5_py(
                [*self.community_cards, *self.known_cards[pid]]
            )[1]
            if opponent_handrank > this_player_handrank:
                better_count += 1
            elif opponent_handrank == this_player_handrank:
                tie_count += 1

        if better_count > 0:
            return -1
        else:
            return tie_count

    def calculate_equity_arbitrary(
        self,
        *player_ids: str,
        stages: typing.Iterable[HAND_STAGE_TYPE] = ("preflop", "flop", "turn", "river"),
    ) -> dict[HAND_STAGE_TYPE, dict[str, tuple[float, bool]]]:
        """
        Calculate equity for each given player,
        assuming only these players all-ined.
        Returned value: `{stage: {player_id: (equity, never_lost)}}`
        """
        if len(player_ids) <= 1:
            raise ValueError("At least two player IDs must be given")
        for player_id in player_ids:
            if player_id not in self.known_cards:
                raise ValueError("Player %s does not have known cards" % player_id)
        cards_people: list[tuple[str, tuple[Card, Card]]] = [
            (player_id, self.known_cards[player_id]) for player_id in player_ids
        ]

        # @evaluate_execution_speed
        def get_equities(community: list[Card]) -> dict[str, tuple[float, bool]]:
            """
            Local helper function to get equities with given community cards.
            """
            if len(cards_people) > 2 or len(community) > 0:
                equity_result = equity.EquityResult(
                    [p[1] for p in cards_people], community
                )
                return {
                    p[0]: (equity_result.get_equity_py(i), equity_result.never_lost(i))
                    for i, p in enumerate(cards_people)
                }
            else:  # 2 players
                (pid1, hand1), (pid2, hand2) = cards_people
                cache: equity.HUPreflopEquityCache = get_global_preflop_hu_cache()
                win1, win2, tie = cache.get_winlose_py(hand1, hand2)
                total = win1 + win2 + tie
                return {
                    pid1: (win1 / total + tie / total * 0.5, win2 == 0),
                    pid2: (win2 / total + tie / total * 0.5, win1 == 0),
                }

        result: dict[HAND_STAGE_TYPE, dict[str, tuple[float, bool]]] = {}
        if "preflop" in stages:
            result["preflop"] = get_equities([])
        if "flop" in stages:
            if len(self.community_cards) >= 3:
                result["flop"] = get_equities(self.community_cards[:3])
            else:
                raise ValueError("Not enough community cards(Flop cards are unknown)")
        if "turn" in stages:
            if len(self.community_cards) >= 4:
                result["turn"] = get_equities(self.community_cards[:4])
            else:
                raise ValueError("Not enough community cards(Turn card is unknown)")
        if "river" in stages:
            if len(self.community_cards) >= 5:
                result["river"] = get_equities(self.community_cards[:5])
            else:
                raise ValueError("Not enough community cards(River card is unknown)")
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
        return float(CurrencyRates().get_rate(from_currency, to_currency))
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


GLOBAL_PREFLOP_HU_CACHE: equity.HUPreflopEquityCache | None = None


def get_global_preflop_hu_cache(
    *,
    default_path: Path | None = None,
) -> equity.HUPreflopEquityCache:
    """
    Get the global preflop HU equity cache.
    If not loaded, load it from the default file.
    """
    global GLOBAL_PREFLOP_HU_CACHE
    if GLOBAL_PREFLOP_HU_CACHE is None:
        GLOBAL_PREFLOP_HU_CACHE = equity.HUPreflopEquityCache(
            default_path or Path(__file__).parent / "hu_preflop_cache.txt.gz"
        )
    return GLOBAL_PREFLOP_HU_CACHE


class SequentialHandHistories:
    """
    Represents a sequence of hand histories in same game.
    """

    def __init__(
        self,
        histories: typing.Iterable[HandHistory],
        re_entry_number: int = 0,
    ) -> None:
        self.histories: list[HandHistory] = sorted(
            histories, key=lambda h: h.sorting_key()
        )
        self.re_entry_number: int = re_entry_number

        if len(set(h.id for h in self.histories)) != len(self.histories):
            raise ValueError("Duplicate hand IDs in the given histories")
        elif len(self.histories) == 0:
            raise ValueError("No hand histories given")
        elif len(set(h.tournament_id for h in self.histories)) != 1:
            raise ValueError("Histories are not from the same tournament")
        elif self.re_entry_number < 0:
            raise ValueError("Re-entry number must be non-negative")

    def get_name(self) -> str:
        """
        Get the tournament name of this sequence.
        """
        first_hh = self.histories[0]
        if first_hh.tournament_name is not None:
            return "%s (%s / Trial #%d)" % (
                first_hh.tournament_name,
                first_hh.dt.strftime("%Y%m%d"),
                self.re_entry_number + 1,
            )
        else:
            raise ValueError("Tournament name is not set")

    def generate_chip_history(self) -> list[int]:
        """
        Generate the chip history for the "Hero" player.
        """
        chip_history: list[int] = [self.histories[0].initial_chips("Hero")]
        for hand in self.histories:
            chip_history.append(chip_history[-1] + hand.net_profit("Hero"))
        return chip_history

    @staticmethod
    def generate_sequences(
        histories: typing.Iterable[HandHistory],
    ) -> typing.Iterable["SequentialHandHistories"]:
        """
        Generate sequences of hand histories from given iterable.
        """
        sorted_histories = sorted(histories, key=lambda h: h.sorting_key())
        for _tourney_id, group in itertools.groupby(
            sorted_histories, lambda h: h.tournament_id
        ):
            reset_count: int = 0
            lis: list[HandHistory] = []
            for i, history in enumerate(group):
                lis.append(history)
                if history.initial_chips("Hero") + history.net_profit("Hero") == 0:
                    yield SequentialHandHistories(lis, re_entry_number=reset_count)
                    # Not using `clear`, instead allocate a new list
                    # just for getting safety from constructor change
                    lis = []
                    reset_count += 1
            if lis:
                yield SequentialHandHistories(lis, re_entry_number=reset_count)


class GeneralSimpleSegTree(typing.Generic[T]):
    """
    A simple segment tree implementation for range queries.
    """

    def __init__(
        self,
        data: typing.Iterable[T],
        func: typing.Callable[[T, T], T],
    ) -> None:
        self._func = func
        self._data: list[list[T]] = [list(data)]
        while len(self._data[-1]) > 1:
            prev_level = self._data[-1]
            next_level: list[T] = []
            for i in range(0, len(prev_level), 2):
                if i + 1 < len(prev_level):
                    next_level.append(func(prev_level[i], prev_level[i + 1]))
                else:
                    next_level.append(prev_level[i])
            self._data.append(next_level)

    def change(self, index: int, value: T) -> None:
        """
        Change the value at the given index.
        """
        if index < 0 or index >= len(self._data[0]):
            raise IndexError("Index out of range for segment tree change")

        self._data[0][index] = value
        for level in range(1, len(self._data)):
            index >>= 1
            left = index * 2
            right = left + 1
            if right < len(self._data[level - 1]):
                self._data[level][index] = self._func(
                    self._data[level - 1][left], self._data[level - 1][right]
                )
            else:
                self._data[level][index] = self._data[level - 1][left]

    def get(self, left: int | None = None, right: int | None = None) -> T:
        """
        Perform a range query on the segment tree.
        The range is [left, right).
        """
        if left is None:
            left = 0
        if right is None:
            right = len(self._data[0])
        if left < 0 or right > len(self._data[0]) or left >= right:
            raise IndexError(
                "Invalid range for segment tree query: [%d, %d)" % (left, right)
            )

        # Collect elements with their original indices for proper ordering
        elements_with_indices = []
        current_left, current_right = left, right
        level = 0

        while current_left < current_right:
            # If left boundary is odd, take the element
            if current_left & 1:
                # Calculate the original index range this element represents
                start_idx = current_left << level
                elements_with_indices.append(
                    (start_idx, self._data[level][current_left])
                )
                current_left += 1

            # If right boundary is odd, take the element
            if current_right & 1:
                current_right -= 1
                # Calculate the original index range this element represents
                start_idx = current_right << level
                elements_with_indices.append(
                    (start_idx, self._data[level][current_right])
                )

            # Move to next level
            current_left >>= 1
            current_right >>= 1
            level += 1

        # Sort by original index to maintain left-to-right order
        # Apply function left-to-right to maintain order
        # for the (potentially non-commutative) operation
        elements_with_indices.sort(key=lambda x: x[0])
        result = elements_with_indices[0][1]
        for i in range(1, len(elements_with_indices)):
            result = self._func(result, elements_with_indices[i][1])
        return result
