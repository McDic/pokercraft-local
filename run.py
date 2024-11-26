from argparse import ArgumentParser
from datetime import datetime
from pathlib import Path

from pokercraft_local.csvdata import export_csv
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
        set(PokercraftParser.crawl_files([main_path], follow_symlink=True)),
        key=lambda t: t.sorting_key(),
    )
    print(f"{len(summaries)} summaries gathered")
    print(f"You've got {sum(1 for s in summaries if s.profit > 0)} profitable games")

    current_time_strf = datetime.now().strftime("%Y%m%d_%H%M%S.%f")

    # Export CSV
    csv_path = output_path / f"summaries_{current_time_strf}.csv"
    export_csv(csv_path, summaries)
    print(f"Exported CSV at {csv_path}")

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
