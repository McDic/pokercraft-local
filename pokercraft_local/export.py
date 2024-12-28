from datetime import datetime
from pathlib import Path
from typing import Iterable

from .data_structures import CurrencyRateConverter, TournamentSummary
from .parser import PokercraftParser
from .translate import Language
from .visualize import plot_total


def export_csv(target_path: Path, summaries: Iterable[TournamentSummary]) -> None:
    with open(target_path, "w", encoding="utf-8") as csv_file:
        csv_file.write(
            "num,id,start_time,name,buy_in,my_prize,my_entries,my_rank,net_profit\n"
        )
        net_profit: float = 0
        for i, summary in enumerate(summaries):
            net_profit += summary.profit
            csv_file.write("%d,%s,%.2f\n" % (i + 1, summary, net_profit))


def export(
    *,
    main_path: Path,
    output_path: Path,
    nickname: str,
    allow_freerolls: bool,
    lang: Language,
    exclude_csv: bool = True,
    use_realtime_currency_rate: bool = True,
) -> tuple[Path, Path]:
    """
    Export data from given info,
    then return `csv_file_path` and `plot_file_path`.
    """
    if not main_path.is_dir():
        raise NotADirectoryError(f"{main_path} is not a directory")
    elif not output_path.is_dir():
        raise NotADirectoryError(f"{output_path} is not a directory")

    summaries = sorted(
        set(
            PokercraftParser.crawl_files(
                [main_path],
                follow_symlink=True,
                allow_freerolls=allow_freerolls,
                rate_converter=CurrencyRateConverter(
                    update_from_forex=use_realtime_currency_rate
                ),
            )
        ),
        key=lambda t: t.sorting_key(),
    )
    current_time_strf = datetime.now().strftime("%Y%m%d_%H%M%S.%f")

    # Export CSV
    csv_path = output_path / f"summaries_{current_time_strf}.csv"
    if not exclude_csv:
        export_csv(csv_path, summaries)

    # Export plot HTML
    plot_path = output_path / f"result_{current_time_strf}.html"
    with open(plot_path, "w", encoding="utf-8") as html_file:
        html_file.write(plot_total(nickname, summaries, lang=lang))

    return csv_path, plot_path
