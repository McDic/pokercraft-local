from pathlib import Path
from typing import Iterable

from .data_structures import TournamentSummary


def export_csv(target_path: Path, summaries: Iterable[TournamentSummary]) -> None:
    with open(target_path, "w", encoding="utf-8") as csv_file:
        csv_file.write(
            "num,id,start_time,name,buy_in,my_prize,my_entries,my_rank,net_profit\n"
        )
        net_profit: float = 0
        for i, summary in enumerate(summaries):
            net_profit += summary.profit
            csv_file.write("%d,%s,%.2f\n" % (i + 1, summary, net_profit))
