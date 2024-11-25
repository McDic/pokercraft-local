import re as regex
import typing
from datetime import datetime
from io import StringIO

from .data_structures import Currency, TournamentSummary

STR_PATTERN = regex.Pattern[str]
ANY_INT: STR_PATTERN = regex.compile(r"\d+")
ANY_MONEY: STR_PATTERN = regex.compile(r"[\$¥]\d(\d|(,\d))*(\.[\d,]+)?")


def convert_money_to_float(s: str) -> float:
    """
    Convert a string to a float.
    """
    s = s.strip()
    if ANY_MONEY.fullmatch(s) is None:
        raise ValueError(f"Failed to parse given string {s} as money.")
    for cur in Currency:
        if cur.value[0] == s[0]:
            return float(s[1:].replace(",", "")) / cur.value[1]
    else:
        raise ValueError(f"Unknown currency {s[0]} detected")


def take_all_money(s: str) -> typing.Generator[float, None, None]:
    """
    Take all money from a string.
    """
    for match in ANY_MONEY.finditer(s):
        yield convert_money_to_float(match.group())


def take_first_int(s: str) -> int:
    """
    Take the first integer from a string.
    """
    i = ANY_INT.search(s)
    if i is None:
        raise ValueError(f"Failed to pop int from given string {s}.")
    else:
        return int(i.group())


class PokercraftParser:
    """
    This class parses summary files from Pokercraft.
    """

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
    LINE8_MY_PRIZE: STR_PATTERN = regex.compile(r"You received a total of .+")

    @classmethod
    def parse(cls, instream: StringIO) -> TournamentSummary:
        """
        Parse given file into `TournamentSummary` object.
        """
        t_id: int
        t_name: str
        t_buy_in_pure: float
        t_rake: float
        t_total_prize_pool: float
        t_start_time: datetime
        t_my_rank: int
        t_my_prize: float

        # Main loop
        for line in instream:
            if not line.strip():
                continue

            elif cls.LINE1_ID_NAME.fullmatch(line):
                id_str, name, gametype = [s.strip() for s in line.split(",")]
                id_str_searched = ANY_INT.search(id_str)
                assert id_str_searched is not None
                t_id = int(id_str_searched.group())
                t_name = name

            elif cls.LINE2_BUYIN.fullmatch(line):
                buy_ins: list[float] = sorted(take_all_money(line))
                t_rake = buy_ins[0]
                t_buy_in_pure = sum(buy_ins) - t_rake

            elif cls.LINE3_ENTRIES.fullmatch(line):
                t_total_players = take_first_int(line)

            elif cls.LINE4_PRIZEPOOL.fullmatch(line):
                t_total_prize_pool = next(take_all_money(line))

            elif cls.LINE5_START_TIME.fullmatch(line):
                splitted = line.split(" ")
                t_start_time = datetime.strptime(
                    splitted[-2] + " " + splitted[-1], "%Y/%m/%d %H:%M:%S"
                )

            elif cls.LINE6_MY_RANK_AND_PRIZE.fullmatch(line):
                pass  # Will cover in LINE7 / LINE8

            elif cls.LINE7_MY_RANK.fullmatch(line):
                t_my_rank = take_first_int(line)

            elif cls.LINE8_MY_PRIZE.fullmatch(line):
                t_my_prize = next(take_all_money(line))

        return TournamentSummary(
            id=t_id,
            name=t_name,
            buy_in_pure=t_buy_in_pure,
            rake=t_rake,
            total_prize_pool=t_total_prize_pool,
            start_time=t_start_time,
            my_rank=t_my_rank,
            total_players=t_total_players,
            my_prize=t_my_prize,
        )
