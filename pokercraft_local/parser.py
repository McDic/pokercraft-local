import logging
import re as regex
import typing
import warnings
from abc import ABC, abstractmethod
from datetime import datetime
from io import TextIOWrapper
from pathlib import Path
from zipfile import ZipFile

from .constants import ANY_INT, ANY_MONEY, STR_PATTERN
from .data_structures import (
    BetAction,
    Currency,
    CurrencyRateConverter,
    HandHistory,
    TournamentSummary,
)
from .rust import card

Card = card.Card

logger = logging.getLogger("pokercraft_local.parser")


def convert_money_to_float(
    s: str,
    rate_converter: CurrencyRateConverter,
    supposed_currency: Currency | None = None,
) -> float:
    """
    Convert a string to a float.
    """
    s = s.strip()
    if ANY_MONEY.fullmatch(s) is None:
        raise ValueError(f"Failed to parse given string {s} as money.")
    for cur in Currency:
        if cur.value == s[0]:
            if supposed_currency is not None and s[0] != supposed_currency.value:
                raise ValueError(
                    f"Supposed currency {supposed_currency.value} is "
                    f"different from detected currency {s}."
                )
            return rate_converter.convert(cur, amount=float(s[1:].replace(",", "")))
    else:
        raise ValueError(f"Unknown currency {s[0]} detected")


def take_all_money(
    s: str,
    rate_converter: CurrencyRateConverter,
    supposed_currency: Currency | None = None,
) -> typing.Generator[float, None, None]:
    """
    Take all money from a string.
    """
    for match in ANY_MONEY.finditer(s):
        yield convert_money_to_float(
            match.group(), rate_converter, supposed_currency=supposed_currency
        )


def take_first_int(s: str) -> int:
    """
    Take the first integer from a string.
    """
    i = ANY_INT.search(s)
    if i is None:
        raise ValueError(f"Failed to pop int from given string {s}.")
    else:
        return int(i.group())


T = typing.TypeVar("T")


class AbstractParser(ABC, typing.Generic[T]):
    """
    An abstract parser class.
    """

    TARGET_FILENAME_PREFIX_PATTERN: typing.ClassVar[STR_PATTERN]

    @classmethod
    def is_target_txt(cls, name: Path | str) -> bool:
        """
        Check if the given file is a valid target file.
        """
        if isinstance(name, Path):
            return (
                name.is_file()
                and name.suffix == ".txt"
                and cls.TARGET_FILENAME_PREFIX_PATTERN.match(name.name) is not None
            )
        elif isinstance(name, str):
            name = name.split("/")[-1]
            return (
                name.endswith(".txt")
                and cls.TARGET_FILENAME_PREFIX_PATTERN.match(name) is not None
            )
        else:  # Should not reach here
            raise TypeError

    @abstractmethod
    def parse(self, instream: typing.TextIO) -> typing.Iterator[T]:
        """
        Parse given stream into object of type `T`.
        """
        raise NotImplementedError

    @classmethod
    def yield_streams(
        cls, paths: typing.Iterable[Path], follow_symlink: bool = True
    ) -> typing.Generator[tuple[Path, typing.TextIO], None, None]:
        """
        Yield streams of files, recursively.
        """
        for path in paths:
            if path.is_dir() and (not path.is_symlink() or follow_symlink):
                yield from cls.yield_streams(
                    path.iterdir(), follow_symlink=follow_symlink
                )
            elif cls.is_target_txt(path):
                with path.open("r", encoding="utf-8") as file:
                    yield path, file
            elif path.is_file() and path.suffix == ".zip":
                with ZipFile(path, "r") as zipfile:
                    for name in zipfile.namelist():
                        if cls.is_target_txt(name):
                            with zipfile.open(name, "r") as file:
                                yield path / name, TextIOWrapper(file, encoding="utf-8")

    def should_skip(self, parsed: T) -> bool:
        """
        Check if the parsed object should be skipped.
        You can also raise an warning here.
        By default, no object is skipped.
        Override this method to implement custom skip behavior.
        """
        return False

    def crawl_files(
        self, paths: typing.Iterable[Path], follow_symlink: bool = True
    ) -> typing.Generator[T, None, None]:
        """
        Crawl files and parse them, recursively.
        Be careful of infinite recursion when `follow_symlink` is True.
        """
        for path, stream in self.yield_streams(paths, follow_symlink=follow_symlink):
            try:
                for parsed in self.parse(stream):
                    if not self.should_skip(parsed):
                        yield parsed
            except ValueError as err:
                logger.warning(
                    "Failed to parse file %s, skipping. (%s: %s)",
                    path,
                    type(err).__name__,
                    err,
                )
            except Exception as err:
                logger.error(
                    "Failed to parse file %s with fatal error. (%s: %s)",
                    path,
                    type(err).__name__,
                    err,
                )
                raise


class PokercraftSummaryParser(AbstractParser[TournamentSummary]):
    """
    This class parses summary files from Pokercraft.
    """

    TARGET_FILENAME_PREFIX_PATTERN: typing.ClassVar[STR_PATTERN] = regex.compile(
        r"GG\d{8} - Tournament #\d+ - "
    )

    LINE1_ID_NAME: STR_PATTERN = regex.compile(r"Tournament #[0-9]+, .+, .+")
    LINE2_BUYIN: STR_PATTERN = regex.compile(r"Buy-in: .+")
    LINE3_ENTRIES: STR_PATTERN = regex.compile(r"\d+ Players")
    LINE4_PRIZEPOOL: STR_PATTERN = regex.compile(r"Total Prize Pool: .+")
    LINE5_START_TIME: STR_PATTERN = regex.compile(
        r"Tournament started \d{4}\/\d{2}\/\d{2} \d{2}\:\d{2}\:\d{2}"
    )
    LINE6_MY_RANK_AND_PRIZE: STR_PATTERN = regex.compile(
        r"\d+(st|nd|rd|th) \: Hero, .+"
    )
    LINE7_MY_RANK: STR_PATTERN = regex.compile(r"You finished the tournament in \d+.+")
    LINE8_MY_PRIZE: STR_PATTERN = regex.compile(
        r"You (made \d+( re)?-entries and )?received a total of .+"
    )
    LINE8_REENTRIES: STR_PATTERN = regex.compile(r"You made \d+( re)?-entries .+")
    LINE8_ADVANCED_DAY1: STR_PATTERN = regex.compile(r"You have advanced to .+")

    def __init__(
        self,
        rate_converter: CurrencyRateConverter,
        allow_freerolls: bool,
    ) -> None:
        self.rate_converter = rate_converter
        self.allow_freerolls = allow_freerolls

    def parse(self, instream: typing.TextIO) -> typing.Iterator[TournamentSummary]:
        t_id: int
        t_name: str
        t_buy_in_pure: float
        t_rake: float
        t_total_prize_pool: float
        t_start_time: datetime
        t_my_rank: int
        t_my_prize: float
        t_my_entries: int = 1

        first_detected_currency: Currency | None = None

        # Main loop
        try:
            for line in instream:
                line = line.strip()
                if not line:
                    continue

                if (
                    not self.LINE1_ID_NAME.fullmatch(line)
                    and first_detected_currency is None
                ):
                    for cur in Currency:
                        if cur.value[0] in line:
                            first_detected_currency = cur
                            break

                if self.LINE1_ID_NAME.fullmatch(line):
                    stripped = [s.strip() for s in line.split(",")]
                    id_str_searched = ANY_INT.search(stripped[0])
                    assert id_str_searched is not None
                    t_id = int(id_str_searched.group())
                    t_name = ",".join(stripped[1:-1])

                elif self.LINE2_BUYIN.fullmatch(line):
                    buy_ins: list[float] = sorted(
                        take_all_money(
                            line,
                            self.rate_converter,
                            supposed_currency=first_detected_currency,
                        )
                    )
                    t_rake = buy_ins[0]
                    t_buy_in_pure = sum(buy_ins) - t_rake
                    # If rake is too big, then probably no rake is specified,
                    # Therefore set the rake to zero
                    if t_rake >= 0.3 * (t_buy_in_pure + t_rake):
                        t_buy_in_pure += t_rake
                        t_rake = 0.0

                elif self.LINE3_ENTRIES.fullmatch(line):
                    t_total_players = take_first_int(line)

                elif self.LINE4_PRIZEPOOL.fullmatch(line):
                    t_total_prize_pool = next(
                        take_all_money(
                            line,
                            self.rate_converter,
                            supposed_currency=first_detected_currency,
                        )
                    )

                elif self.LINE5_START_TIME.fullmatch(line):
                    splitted = line.split(" ")
                    t_start_time = datetime.strptime(
                        splitted[-2] + " " + splitted[-1], "%Y/%m/%d %H:%M:%S"
                    )
                    # Pokercraft timezone data is set to local system time

                elif self.LINE6_MY_RANK_AND_PRIZE.fullmatch(line):
                    t_my_rank = take_first_int(line)
                    t_my_prize = sum(
                        take_all_money(
                            line,
                            self.rate_converter,
                            supposed_currency=first_detected_currency,
                        )
                    )
                    # Flip & Go displays "$0 Entry" as prize
                    if t_my_prize <= 0.0 and "$0 Entry" in line:
                        t_my_prize = (
                            t_buy_in_pure + t_rake
                        )  # type: ignore[reportUnboundVariable]

                elif self.LINE8_MY_PRIZE.fullmatch(line):
                    if self.LINE8_REENTRIES.fullmatch(line):
                        t_my_entries += take_first_int(line)

            yield TournamentSummary(
                id=t_id,
                name=t_name,
                buy_in_pure=t_buy_in_pure,
                rake=t_rake,
                total_prize_pool=t_total_prize_pool,
                start_time=t_start_time,
                my_rank=t_my_rank,
                total_players=t_total_players,
                my_prize=t_my_prize,
                my_entries=t_my_entries,
            )

        except (StopIteration, UnboundLocalError) as err:
            raise ValueError("Incomplete data, failed to parse summary.") from err

    def should_skip(self, parsed: TournamentSummary) -> bool:
        # Warnings
        if parsed.total_prize_pool <= 0:
            warnings.warn(f"Detected zero prize pool for {parsed.name}")
            return True

        # Yielding parsed summaries
        if parsed.buy_in == 0 and not self.allow_freerolls:
            logger.debug(f"Detected freeroll {parsed.name}, skipping.")
            return True

        else:
            return False


HAND_HISTORY_STAGE_TYPE: typing.TypeAlias = typing.Literal[
    "preflop", "flop", "turn", "river", "showdown"
]


class PokercraftHandHistoryParser(AbstractParser[HandHistory]):
    """
    This class parses hand history files from Pokercraft.
    """

    TARGET_FILENAME_PREFIX_PATTERN: typing.ClassVar[STR_PATTERN] = regex.compile(
        r"GG\d{8}-\d{4} - ((?!(Short Deck|Omaha)).)*\.txt$"
    )

    LINE1_INTRO: STR_PATTERN = regex.compile(
        r"Poker Hand #(TM|BR|SG)(\d+)\: Tournament #(\d+)\, (.+) \- Level(\d+)"
        r"\(([\d\,]+)\/([\d\,]+)\) \- (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})"
    )
    LINE2_TABLE_NUM: STR_PATTERN = regex.compile(
        r"Table '(\d+)' (\d+)-max Seat #(\d+) is the button"
    )
    LINE3_SEAT_INFO: STR_PATTERN = regex.compile(
        r"Seat (\d+): ([0-9a-f]+|Hero) \(([\d\,]+) in chips\)"
    )
    LINE4_POSTS_DEAD_MONEY: STR_PATTERN = regex.compile(
        r"([0-9a-f]+|Hero)\: posts (?:the )?(ante|big blind|small blind) ([\d\,]+)"
    )
    LINE5_HOLE_CARDS: typing.Final[str] = "*** HOLE CARDS ***"
    LINE5_DEALT_TO: STR_PATTERN = regex.compile(
        r"Dealt to ([0-9a-f]+|Hero)( \[[2-9AKQJT][sdch] [2-9AKQJT][sdch]\])?"
    )

    LINE6_HEADER_FLOP: STR_PATTERN = regex.compile(
        r"\*\*\* FLOP \*\*\* \[((?:[2-9AKQJT][sdch] ?){3})\]"
    )
    LINE6_HEADER_TURN: STR_PATTERN = regex.compile(
        r"\*\*\* TURN \*\*\* \[((?:[2-9AKQJT][sdch] ?){3})\] \[([2-9AKQJT][sdch])\]"
    )
    LINE6_HEADER_RIVER: STR_PATTERN = regex.compile(
        r"\*\*\* RIVER \*\*\* \[((?:[2-9AKQJT][sdch] ?){4})\] \[([2-9AKQJT][sdch])\]"
    )
    LINE6_BETTING_ACTION: STR_PATTERN = regex.compile(
        r"([0-9a-f]+|Hero)\: (folds|checks|calls ([\d\,]+)"
        r"|raises ([\d\,]+) to ([\d\,]+)|bets ([\d\,]+))( and is all-in)?"
    )
    LINE6_RETURNED_UNCALLED_BET: STR_PATTERN = regex.compile(
        r"Uncalled bet \(([\d\,]+)\) returned to ([0-9a-f]+|Hero)"
    )
    LINE6_SHOWS: STR_PATTERN = regex.compile(
        r"([0-9a-f]+|Hero)\: shows \[([2-9AKQJT][sdch]( [2-9AKQJT][sdch])?)\]"
    )

    LINE7_HEADER_SHOWDOWN: typing.Final[str] = "*** SHOWDOWN ***"
    LINE7_COLLECTED: STR_PATTERN = regex.compile(
        r"([0-9a-f]+|Hero) collected ([\d\,]+) from pot"
    )

    LINE8_HEADER_SUMMARY: typing.Final[str] = "*** SUMMARY ***"
    LINE8_POT: STR_PATTERN = regex.compile(
        r"Total pot ([\d\,]+) \| Rake ([\d\,]+) \| "
        r"Jackpot ([\d\,]+) \| Bingo ([\d\,]+) \| "
        r"Fortune ([\d\,]+) \| Tax ([\d\,]+)"
    )
    LINE8_BOARD: STR_PATTERN = regex.compile(r"Board \[((?:[2-9AKQJT][sdch] ?){3,5})\]")
    LINE8_INFO_BY_SEAT: STR_PATTERN = regex.compile(
        r"Seat (\d+): ([0-9a-f]+|Hero) "
        r"(?:\((button|big blind|small blind)?\) )?"
        r"(folded (?:before|on the) (Flop|Turn|River)|"
        r"showed \[([2-9AKQJT][sdch]( [2-9AKQJT][sdch])?)\] "
        r"and (?:(?:won|collected) \([\d\,]+\)|lost with)|"
        r"(?:won|collected) \(([\d\,]+)\))"
    )

    @staticmethod
    def final_postprocess_handhistory(hand_history: HandHistory) -> HandHistory:
        """
        Do some postprocessing on parsed data before yielding.
        """
        # Ante all-in?
        max_ante = max(
            action.amount
            for action in hand_history.actions_preflop
            if action.action == "ante"
        )
        for i, action in enumerate(hand_history.actions_preflop):
            if (
                action.action == "ante"
                and action.amount < max_ante
                and not action.is_all_in
            ):
                hand_history.actions_preflop[i] = action.all_in_toggled()

        # SB/BB all-in?
        for i, action in enumerate(hand_history.actions_preflop):
            if action.action == "blind":
                if (
                    hand_history.sb_seat is not None
                    and hand_history.seats[hand_history.sb_seat][0] == action.player_id
                    and hand_history.sb > action.amount
                    and not action.is_all_in
                ) or (
                    hand_history.seats[hand_history.bb_seat][0] == action.player_id
                    and hand_history.bb > action.amount
                    and not action.is_all_in
                ):
                    hand_history.actions_preflop[i] = action.all_in_toggled()

        return hand_history

    def parse(self, instream: typing.TextIO) -> typing.Iterator[HandHistory]:
        continuous_newline_count: int = 0
        this_hand_history: HandHistory
        current_stage: HAND_HISTORY_STAGE_TYPE = "preflop"

        def raise_if_not_in_stage(
            expected_stage: HAND_HISTORY_STAGE_TYPE | list[HAND_HISTORY_STAGE_TYPE],
            line_pattern_name: str,
        ) -> None:
            """
            Raise ValueError if not in expected stage.
            """
            if (
                isinstance(expected_stage, str) and current_stage != expected_stage
            ) or (
                isinstance(expected_stage, list) and current_stage not in expected_stage
            ):
                raise ValueError(
                    f"Expected stage {expected_stage} on pattern {line_pattern_name}"
                )

        try:
            for lineno, line in enumerate(instream):
                line = line.strip()
                if not line:
                    continuous_newline_count += 1
                    if continuous_newline_count >= 3:
                        break
                    continue
                continuous_newline_count = 0

                if match := self.LINE1_INTRO.match(line):
                    (
                        _,
                        hand_id_str,
                        tournament_id_str,
                        tournament_name,
                        level_str,
                        sb_str,
                        bb_str,
                        dt_str,
                    ) = match.groups()
                    hand_id = int(hand_id_str)
                    tournament_id = int(tournament_id_str)
                    level = int(level_str)
                    sb = int(sb_str.replace(",", ""))
                    bb = int(bb_str.replace(",", ""))
                    dt = datetime.strptime(dt_str, "%Y/%m/%d %H:%M:%S")

                    this_hand_history = HandHistory(
                        id=f"TM{hand_id}",
                        tournament_id=tournament_id,
                        tournament_name=tournament_name,
                        level=level,
                        sb=sb,
                        bb=bb,
                        dt=dt,
                        button_seat=-1,  # To be filled later
                        sb_seat=None,
                        bb_seat=-1,  # To be filled later
                        max_seats=999,  # To be filled later
                    )
                    current_stage = "preflop"

                elif match := self.LINE2_TABLE_NUM.match(line):
                    raise_if_not_in_stage("preflop", "LINE2_TABLE_NUM")
                    (
                        _table_num_str,
                        max_seats_str,
                        button_seat_str,
                    ) = match.groups()
                    max_seats = int(max_seats_str)
                    button_seat = int(button_seat_str)
                    this_hand_history.max_seats = max_seats
                    this_hand_history.button_seat = button_seat

                elif match := self.LINE3_SEAT_INFO.match(line):
                    raise_if_not_in_stage("preflop", "LINE3_SEAT_INFO")
                    seat_num_str, player_id, chips_str = match.groups()
                    seat_num = int(seat_num_str)
                    chips = int(chips_str.replace(",", ""))
                    this_hand_history.seats[seat_num] = (player_id, chips)

                elif match := self.LINE4_POSTS_DEAD_MONEY.match(line):
                    raise_if_not_in_stage("preflop", "LINE4_POSTS_DEAD_MONEY")
                    player_id, post_type, amount_str = match.groups()
                    amount = int(amount_str.replace(",", ""))
                    this_hand_history.actions_preflop.append(
                        BetAction(
                            player_id=player_id,
                            action="ante" if post_type == "ante" else "blind",
                            amount=amount,
                            is_all_in=False,
                        )
                    )
                    if post_type == "small blind":
                        this_hand_history.sb_seat = this_hand_history.get_seat_number(
                            player_id
                        )
                    elif post_type == "big blind":
                        this_hand_history.bb_seat = this_hand_history.get_seat_number(
                            player_id
                        )

                elif line == self.LINE5_HOLE_CARDS:  # Just a marker line
                    raise_if_not_in_stage("preflop", "LINE5_HOLE_CARDS")

                elif match := self.LINE5_DEALT_TO.match(line):
                    raise_if_not_in_stage("preflop", "LINE5_DEALT_TO")
                    player_id = match.group(1)
                    if (group_card := match.group(2)) is not None:
                        cards_str = group_card.strip()
                        player_cards = [
                            Card(card_str) for card_str in cards_str[1:-1].split(" ")
                        ]
                        if len(player_cards) != 2:
                            raise ValueError(
                                f"Expected 2 hole cards, got {player_cards}"
                            )
                        this_hand_history.known_cards[player_id] = (
                            player_cards[0],
                            player_cards[1],
                        )

                elif match := self.LINE6_HEADER_FLOP.match(line):
                    raise_if_not_in_stage("preflop", "LINE6_HEADER_FLOP")
                    cards_str = match.group(1)
                    community_cards = [
                        Card(card_str) for card_str in cards_str.split(" ")
                    ]
                    if len(community_cards) != 3:
                        raise ValueError(
                            f"Expected 3 flop cards, got {community_cards}"
                        )
                    elif this_hand_history.community_cards:
                        raise ValueError("Flop cards already set.")
                    this_hand_history.community_cards.extend(community_cards)
                    current_stage = "flop"

                elif match := self.LINE6_HEADER_TURN.match(line):
                    raise_if_not_in_stage("flop", "LINE6_HEADER_TURN")
                    cards_str, turn_card_str = match.groups()
                    community_cards = [
                        Card(card_str) for card_str in cards_str.split(" ")
                    ]
                    if len(community_cards) != 3:
                        raise ValueError(
                            f"Expected 3 flop cards, got {community_cards}"
                        )
                    elif (
                        len(this_hand_history.community_cards) != 3
                        or this_hand_history.community_cards[:3] != community_cards
                    ):
                        raise ValueError("Flop cards not set correctly.")
                    turn_card = Card(turn_card_str)
                    this_hand_history.community_cards.append(turn_card)
                    current_stage = "turn"

                elif match := self.LINE6_HEADER_RIVER.match(line):
                    raise_if_not_in_stage("turn", "LINE6_HEADER_RIVER")
                    cards_str, river_card_str = match.groups()
                    community_cards = [
                        Card(card_str) for card_str in cards_str.split(" ")
                    ]
                    if len(community_cards) != 4:
                        raise ValueError(
                            f"Expected 4 turn cards, got {community_cards}"
                        )
                    elif (
                        len(this_hand_history.community_cards) != 4
                        or this_hand_history.community_cards[:4] != community_cards
                    ):
                        raise ValueError("Flop & turn cards not set correctly.")
                    river_card = Card(river_card_str)
                    this_hand_history.community_cards.append(river_card)
                    current_stage = "river"

                elif match := self.LINE6_BETTING_ACTION.match(line):
                    raise_if_not_in_stage(
                        ["preflop", "flop", "turn", "river"],
                        "LINE6_BETTING_ACTION",
                    )
                    if (player_id := match.group(1)) is None:
                        raise ValueError("No player ID detected.")
                    if (g2 := match.group(2)) is None:
                        raise ValueError("No action detected.")

                    this_action: BetAction
                    if g2.startswith("folds"):
                        this_action = BetAction(
                            player_id=player_id,
                            action="fold",
                            amount=0,
                            is_all_in=False,
                        )
                    elif g2.startswith("checks"):
                        this_action = BetAction(
                            player_id=player_id,
                            action="check",
                            amount=0,
                            is_all_in=False,
                        )
                    elif g2.startswith("calls"):
                        if (amount_str := match.group(3)) is None:
                            raise ValueError("No call amount detected.")
                        amount = int(amount_str.replace(",", ""))
                        this_action = BetAction(
                            player_id=player_id,
                            action="call",
                            amount=amount,
                            is_all_in=(match.group(7) is not None),
                        )
                    elif g2.startswith("bets"):
                        if (amount_str := match.group(6)) is None:
                            raise ValueError("No bet amount detected.")
                        amount = int(amount_str.replace(",", ""))
                        this_action = BetAction(
                            player_id=player_id,
                            action="bet",
                            amount=amount,
                            is_all_in=(match.group(7) is not None),
                        )
                    elif g2.startswith("raises"):
                        if (to_str := match.group(5)) is None:
                            raise ValueError("No raise-to amount detected.")
                        amount = int(to_str.replace(",", ""))
                        this_action = BetAction(
                            player_id=player_id,
                            action="raise",
                            amount=amount,
                            is_all_in=(match.group(7) is not None),
                        )
                    else:
                        raise ValueError(f"Unknown action {g2}")

                    if this_action.is_all_in:
                        if player_id in this_hand_history.all_ined:
                            raise ValueError(f"Player {player_id} is already all-in.")
                        assert current_stage != "showdown"
                        this_hand_history.all_ined[player_id] = current_stage

                    if current_stage == "preflop":
                        this_hand_history.actions_preflop.append(this_action)
                    elif current_stage == "flop":
                        this_hand_history.actions_flop.append(this_action)
                    elif current_stage == "turn":
                        this_hand_history.actions_turn.append(this_action)
                    elif current_stage == "river":
                        this_hand_history.actions_river.append(this_action)
                    else:
                        raise Exception("Unreachable code")

                elif match := self.LINE6_RETURNED_UNCALLED_BET.match(line):
                    raise_if_not_in_stage(
                        ["preflop", "flop", "turn", "river"],
                        "LINE6_RETURNED_UNCALLED_BET",
                    )
                    player_id, amount_str = match.group(2), match.group(1)
                    if player_id is None or amount_str is None:
                        raise ValueError("No player ID or amount detected.")
                    amount = int(amount_str.replace(",", ""))
                    this_hand_history.uncalled_returned = (
                        player_id,
                        amount,
                    )

                elif match := self.LINE6_SHOWS.match(line):
                    raise_if_not_in_stage(
                        ["preflop", "flop", "turn", "river"],
                        "LINE6_SHOWS",
                    )
                    player_id = match.group(1)
                    cards_str = match.group(2)
                    if player_id is None:
                        raise ValueError("No player ID detected.")
                    elif cards_str is None:
                        raise ValueError("No cards detected.")
                    cards_str = cards_str.strip()
                    player_cards = [Card(card_str) for card_str in cards_str.split(" ")]
                    if len(player_cards) == 1:
                        logger.debug("Single card shown, skipping.")
                        continue
                    elif len(player_cards) != 2:
                        raise ValueError(f"Expected 2 hole cards, got {player_cards}")
                    if player_id not in this_hand_history.known_cards:
                        this_hand_history.known_cards[player_id] = (
                            player_cards[0],
                            player_cards[1],
                        )
                    elif (player_cards[0], player_cards[1]) != (
                        prev_known_cards := this_hand_history.known_cards[player_id]
                    ):
                        raise ValueError(
                            f"Conflicting hole cards for player {player_id}: "
                            f"{prev_known_cards} vs {player_cards}"
                        )

                elif line == self.LINE7_HEADER_SHOWDOWN:
                    raise_if_not_in_stage(
                        ["preflop", "flop", "turn", "river"],
                        "LINE7_HEADER_SHOWDOWN",
                    )
                    current_stage = "showdown"

                elif match := self.LINE7_COLLECTED.match(line):
                    raise_if_not_in_stage("showdown", "LINE7_COLLECTED")
                    player_id, amount_str = match.groups()
                    if player_id is None:
                        raise ValueError("No player ID detected.")
                    elif amount_str is None:
                        raise ValueError("No amount detected.")
                    amount = int(amount_str.replace(",", ""))
                    if player_id not in this_hand_history.wons:
                        this_hand_history.wons[player_id] = 0
                    this_hand_history.wons[player_id] += amount

                elif line == self.LINE8_HEADER_SUMMARY:
                    raise_if_not_in_stage("showdown", "LINE8_HEADER_SUMMARY")
                    yield self.final_postprocess_handhistory(this_hand_history)
                    del this_hand_history

                elif match := self.LINE8_POT.match(line):
                    raise_if_not_in_stage("showdown", "LINE8_POT")
                    pass  # Ignored for now

                elif match := self.LINE8_BOARD.match(line):
                    raise_if_not_in_stage("showdown", "LINE8_BOARD")
                    pass  # Ignored for now

                elif match := self.LINE8_INFO_BY_SEAT.match(line):
                    raise_if_not_in_stage("showdown", "LINE8_INFO_BY_SEAT")
                    pass  # Ignored for now

                else:
                    raise ValueError(f"Unrecognized line: <{line}>")

        except ValueError as err:
            if "lineno" in locals():
                raise ValueError(f"At line #{lineno}: {err}") from err
            else:
                raise

        except UnboundLocalError as err:
            raise ValueError("Incomplete data, failed to parse hand history.") from err
