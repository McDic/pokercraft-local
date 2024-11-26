from argparse import ArgumentParser
from pathlib import Path

from pokercraft_local.export import export

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
    csv_path, plot_path = export(namespace.data, namespace.output, namespace.nickname)
    print(f"Exported CSV at {csv_path} and Plot at {plot_path}")
