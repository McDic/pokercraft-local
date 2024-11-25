from argparse import ArgumentParser
from datetime import datetime
from pathlib import Path

from pokercraft_local.parser import PokercraftParser
from pokercraft_local.visualize import plot_total


def export(main_path: Path, output_path: Path, nickname: str):
    """
    Export data from given `main_path`.
    """
    if not main_path.is_dir():
        raise NotADirectoryError(f"{main_path} is not a directory")
    elif not output_path.is_dir():
        raise NotADirectoryError(f"{output_path} is not a directory")

    summaries = sorted(
        PokercraftParser.crawl_files([main_path], follow_symlink=True),
        key=lambda t: t.sorting_key(),
    )
    print(f"{len(summaries)} summaries gathered")
    print(f"You've got {sum(1 for s in summaries if s.profit > 0)} profitable games")

    current_time_strf = datetime.now().strftime("%Y%m%d_%H%M%S.%f")

    # Export CSV
    net_profit: float = 0
    with open(output_path / f"summaries_{current_time_strf}.csv", "w") as csv_file:
        csv_file.write(
            "num,id,start_time,name,buy_in,my_prize,my_entries,my_rank,net_profit\n"
        )
        for i, summary in enumerate(summaries):
            net_profit += summary.profit
            csv_file.write("%d,%s,%.2f\n" % (i + 1, summary, net_profit))
        print(f"Exported CSV at {csv_file.name}")

    # Export plot HTML
    with open(output_path / f"result_{current_time_strf}.html", "w") as html_file:
        html_file.write(plot_total(nickname, summaries))
        print(f"Exported plot at {html_file.name}")


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("-d", "--data", type=Path, required=True, help="Data directory")
    parser.add_argument(
        "-o", "--output", type=Path, required=True, help="Output directory"
    )
    parser.add_argument(
        "-n", "--nickname", type=str, required=True, help="Nickname on GGNetwork"
    )
    namespace = parser.parse_args()
    export(namespace.data, namespace.output, namespace.nickname)
