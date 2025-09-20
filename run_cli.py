import logging
from argparse import ArgumentParser
from pathlib import Path

from pokercraft_local.export import export
from pokercraft_local.translate import Language


def get_argparser() -> ArgumentParser:
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
    parser.add_argument(
        "--lang",
        type=(lambda x: Language(x)),
        required=False,
        default=Language.ENGLISH,
        help="Language to use",
    )
    parser.add_argument(
        "--export-csv",
        action="store_true",
        required=False,
        help="Also export CSV if this flag is provided",
    )
    parser.add_argument(
        "--use-forex",
        action="store_true",
        required=False,
        help="Fetch currency rate from the Forex if this flag is provided",
    )
    return parser


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    parser = get_argparser()
    namespace = parser.parse_args()
    print(namespace.export_csv)

    csv_path, plot_path = export(
        main_path=namespace.data,
        output_path=namespace.output,
        nickname=namespace.nickname,
        allow_freerolls=namespace.include_freerolls,
        lang=namespace.lang,
        exclude_csv=(not namespace.export_csv),
        use_realtime_currency_rate=namespace.use_forex,
    )

    if namespace.export_csv:
        print(f"Exported CSV at {csv_path} and Plot at {plot_path}")
    else:
        print(f"Exported Plot at {plot_path}")
