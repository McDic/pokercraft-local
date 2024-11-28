from argparse import ArgumentParser
from pathlib import Path

from pokercraft_local.export import export

if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument(
        "-d",
        "--data",
        type=Path,
        required=True,
        help="Data directory",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        required=True,
        help="Output directory",
    )
    parser.add_argument(
        "-n",
        "--nickname",
        type=str,
        required=True,
        help="Nickname on GGNetwork",
    )
    parser.add_argument(
        "--include-freerolls",
        action="store_true",
        required=False,
        help="Include freerolls if this flag is provided",
    )
    namespace = parser.parse_args()
    csv_path, plot_path = export(
        main_path=namespace.data,
        output_path=namespace.output,
        nickname=namespace.nickname,
        allow_freerolls=namespace.include_freerolls,
    )
    print(f"Exported CSV at {csv_path} and Plot at {plot_path}")
