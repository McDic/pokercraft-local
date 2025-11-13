import logging
from argparse import ArgumentParser
from pathlib import Path

from pokercraft_local.export import export_hand_history_analysis, export_tourney_summary
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
    parser.add_argument(
        "--plot-type",
        choices=["tourney", "handhistory"],
        required=True,
        help="Which plot type to export",
    )
    parser.add_argument(
        "--max-sampling",
        type=int,
        required=False,
        default=None,
        help="Maximum number of hand histories to sample "
        "for hand history analysis (No limit by default)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        required=False,
        help="Enable debug logging if this flag is provided",
    )
    parser.add_argument(
        "--fast-debug",
        action="store_true",
        required=False,
        help="Enable fast debugging",
    )
    return parser


if __name__ == "__main__":
    parser = get_argparser()
    namespace = parser.parse_args()

    logging.basicConfig(level=logging.INFO if not namespace.debug else logging.DEBUG)

    match namespace.plot_type:
        case "tourney":
            csv_path, plot_path = export_tourney_summary(
                main_path=namespace.data,
                output_path=namespace.output,
                nickname=namespace.nickname,
                allow_freerolls=namespace.include_freerolls,
                lang=namespace.lang,
                exclude_csv=(not namespace.export_csv),
                use_realtime_currency_rate=namespace.use_forex,
            )
        case "handhistory":
            if namespace.export_csv:
                raise ValueError(
                    "CSV export is not supported for hand history analysis"
                )
            plot_path = export_hand_history_analysis(
                main_path=namespace.data,
                output_path=namespace.output,
                nickname=namespace.nickname,
                lang=namespace.lang,
                max_sampling=namespace.max_sampling,
                fast_debug_mode=namespace.fast_debug,
            )
        case _:
            raise ValueError(f"Unknown plot type: {namespace.plot_type}")

    if namespace.export_csv:
        print(f"Exported CSV at {csv_path} and Plot at {plot_path}")
    else:
        print(f"Exported Plot at {plot_path}")
