from datetime import datetime
from pathlib import Path
from typing import Iterable

from .data_structures import CurrencyRateConverter, TournamentSummary
from .parser import PokercraftHandHistoryParser, PokercraftSummaryParser
from .translate import Language
from .visualize import plot_hand_histories, plot_tournament_summaries


def export_csv(target_path: Path, summaries: Iterable[TournamentSummary]) -> None:
    with open(target_path, "w", encoding="utf-8") as csv_file:
        csv_file.write(
            "num,id,start_time,name,buy_in,my_prize,my_entries,my_rank,net_profit\n"
        )
        net_profit: float = 0
        for i, summary in enumerate(summaries):
            net_profit += summary.profit
            csv_file.write("%d,%s,%.2f\n" % (i + 1, summary, net_profit))


def export_tourney_summary(
    *,
    main_path: Path,
    output_path: Path,
    nickname: str,
    allow_freerolls: bool,
    lang: Language,
    exclude_csv: bool = True,
    use_realtime_currency_rate: bool = True,
    toggling_masks: Iterable[bool] = (),
) -> tuple[Path, Path]:
    """
    Export data from given info,
    then return `csv_file_path` and `plot_file_path`.
    """
    if not main_path.is_dir():
        raise NotADirectoryError(f"{main_path} is not a directory")
    elif not output_path.is_dir():
        raise NotADirectoryError(f"{output_path} is not a directory")

    # Parse summaries
    summary_parser = PokercraftSummaryParser(
        rate_converter=CurrencyRateConverter(
            update_from_forex=use_realtime_currency_rate
        ),
        allow_freerolls=allow_freerolls,
    )
    summaries = sorted(
        set(summary_parser.crawl_files([main_path], follow_symlink=True)),
        key=lambda t: t.sorting_key(),
    )
    current_time_strf = datetime.now().strftime("%Y%m%d_%H%M%S.%f")

    # Export CSV
    csv_path = output_path / f"analysis_tourney_summaries_{current_time_strf}.csv"
    if not exclude_csv:
        export_csv(csv_path, summaries)

    # Export plot HTML
    plot_path = output_path / f"analysis_tourney_summaries_{current_time_strf}.html"
    with open(plot_path, "w", encoding="utf-8") as html_file:
        html_file.write(
            plot_tournament_summaries(
                nickname,
                summaries,
                lang=lang,
                toggling_masks=toggling_masks,
            )
        )

    return csv_path, plot_path


def export_hand_history_analysis(
    *,
    main_path: Path,
    output_path: Path,
    nickname: str,
    lang: Language,
    max_sampling: int | None = None,
    fast_debug_mode: bool = False,
    toggling_masks: Iterable[bool] = (),
) -> Path:
    """
    Export data from given info and return `plot_file_path`.
    """
    if not main_path.is_dir():
        raise NotADirectoryError(f"{main_path} is not a directory")
    elif not output_path.is_dir():
        raise NotADirectoryError(f"{output_path} is not a directory")

    # Parse hand histories
    hand_history_parser = PokercraftHandHistoryParser()
    hand_histories = sorted(
        hand_history_parser.crawl_files([main_path], follow_symlink=True),
        key=lambda t: t.sorting_key(),
    )
    current_time_strf = datetime.now().strftime("%Y%m%d_%H%M%S.%f")

    # Export HTML
    plot_path = output_path / f"analysis_hand_histories_{current_time_strf}.html"
    with open(plot_path, "w", encoding="utf-8") as html_file:
        html_file.write(
            plot_hand_histories(
                nickname,
                hand_histories,
                lang=lang,
                max_sampling=max_sampling if not fast_debug_mode else 10,
                toggling_masks=toggling_masks,
            )
        )
    return plot_path
