import re as regex
import typing
import warnings
from datetime import datetime
from io import TextIOWrapper
from pathlib import Path

from .data_structures import Currency, TournamentSummary

STR_PATTERN = regex.Pattern[str]
ANY_INT: STR_PATTERN = regex.compile(r"\d+")
ANY_MONEY: STR_PATTERN = regex.compile(r"[\$¥฿₫₱₩]\d(\d|(,\d))*(\.[\d,]+)?")


def convert_money_to_float(s: str, supposed_currency: Currency | None = None) -> float:
    """
    Convert a string to a float.
    """
    s = s.strip()
    if ANY_MONEY.fullmatch(s) is None:
        raise ValueError(f"Failed to parse given string {s} as money.")
    for cur in Currency:
        if cur.value[0] == s[0]:
            if supposed_currency is not None and s[0] != supposed_currency.value[0]:
                raise ValueError(
                    f"Supposed currency {supposed_currency.value[0]} is "
                    f"different from detected currency {s[0]}."
                )
            return float(s[1:].replace(",", "")) / cur.value[1]
    else:
        raise ValueError(f"Unknown currency {s[0]} detected")


def take_all_money(
    s: str, supposed_currency: Currency | None = None
) -> typing.Generator[float, None, None]:
    """
    Take all money from a string.
    """
    for match in ANY_MONEY.finditer(s):
        yield convert_money_to_float(match.group(), supposed_currency=supposed_currency)


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
    LINE8_MY_PRIZE: STR_PATTERN = regex.compile(
        r"You (made \d+ re-entries and )?received a total of .+"
    )
    LINE8_REENTRIES: STR_PATTERN = regex.compile(r"You made \d+ re-entries .+")
    LINE8_ADVANCED_DAY1: STR_PATTERN = regex.compile(r"You have advanced to .+")

    @classmethod
    def parse(cls, instream: TextIOWrapper) -> TournamentSummary:
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
        t_my_entries: int = 1

        first_detected_currency: Currency | None = None

        # Main loop
        for line in instream:
            line = line.strip()
            if not line:
                continue

            if (
                not cls.LINE1_ID_NAME.fullmatch(line)
                and first_detected_currency is None
            ):
                for cur in Currency:
                    if cur.value[0] in line:
                        first_detected_currency = cur
                        break

            if cls.LINE1_ID_NAME.fullmatch(line):
                stripped = [s.strip() for s in line.split(",")]
                id_str_searched = ANY_INT.search(stripped[0])
                assert id_str_searched is not None
                t_id = int(id_str_searched.group())
                t_name = ",".join(stripped[1:-1])

            elif cls.LINE2_BUYIN.fullmatch(line):
                buy_ins: list[float] = sorted(
                    take_all_money(line, supposed_currency=first_detected_currency)
                )
                t_rake = buy_ins[0]
                t_buy_in_pure = sum(buy_ins) - t_rake

            elif cls.LINE3_ENTRIES.fullmatch(line):
                t_total_players = take_first_int(line)

            elif cls.LINE4_PRIZEPOOL.fullmatch(line):
                t_total_prize_pool = next(
                    take_all_money(line, supposed_currency=first_detected_currency)
                )

            elif cls.LINE5_START_TIME.fullmatch(line):
                splitted = line.split(" ")
                t_start_time = datetime.strptime(
                    splitted[-2] + " " + splitted[-1], "%Y/%m/%d %H:%M:%S"
                )

            elif cls.LINE6_MY_RANK_AND_PRIZE.fullmatch(line):
                t_my_rank = take_first_int(line)
                t_my_prize = sum(
                    take_all_money(line, supposed_currency=first_detected_currency)
                )

            elif cls.LINE8_MY_PRIZE.fullmatch(line):
                if cls.LINE8_REENTRIES.fullmatch(line):
                    t_my_entries += take_first_int(line)

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
            my_entries=t_my_entries,
        )

    @classmethod
    def crawl_files(
        cls, paths: typing.Iterable[Path], follow_symlink: bool = False
    ) -> typing.Generator[TournamentSummary, None, None]:
        """
        Crawl files and parse them, recursively.
        Be careful of infinite recursion when `follow_symlink` is True.
        """
        for path in paths:
            if path.is_dir() and (not path.is_symlink() or follow_symlink):
                yield from cls.crawl_files(path.iterdir())
            elif (
                path.is_file() and path.suffix == ".txt" and path.stem.startswith("GG")
            ):
                with path.open("r", encoding="utf-8") as file:
                    try:
                        summary = cls.parse(file)
                        yield summary
                    except (ValueError, UnboundLocalError, StopIteration) as err:
                        print(
                            f"Failed to parse file {path}, skipping. "
                            f"(Reason: {err} ({type(err).__name__}))"
                        )
                        pass
                    except Exception:
                        print(f"Failed to parse file {path} with fatal error.")
                        raise
