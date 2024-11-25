import math
import typing

import pandas as pd  # type: ignore [import-untyped]
import plotly.express as px  # type: ignore [import-untyped]
import plotly.graph_objects as plgo  # type: ignore [import-untyped]
from plotly.subplots import make_subplots  # type: ignore [import-untyped]

from .data_structures import TournamentBrand, TournamentSummary

BASE_HTML_FRAME: typing.Final[
    str
] = '<html><head><meta charset="utf-8" /></head><body>\n%s\n</body></html>'


def get_profit_line_chart(
    tournaments: list[TournamentSummary],
    max_data_points: int = 2000,
):
    """
    Get profit line chart.
    """
    df_base = pd.DataFrame(
        {
            "Buy In": [t.buy_in for t in tournaments],
            "My Entries": [t.my_entries for t in tournaments],
            "Profit": [t.profit for t in tournaments],
            "Rake": [t.rake for t in tournaments],
            "Prize": [t.my_prize for t in tournaments],
            "Rank Ratio": [t.my_rank / t.total_players for t in tournaments],
            "Prize Ratio": [t.my_prize / t.total_prize_pool for t in tournaments],
        }
    )
    df_base["Net Profit"] = df_base["Profit"].cumsum()
    df_base["Net Rake"] = df_base["Rake"].cumsum()
    df_base["Ideal Profit w.o. Rake"] = df_base["Net Profit"] + df_base["Net Rake"]

    # Resampling
    df_base = df_base.iloc[:: max(1, math.ceil(len(df_base) / max_data_points)), :]

    return px.line(
        df_base,
        y=["Net Profit", "Net Rake", "Ideal Profit w.o. Rake"],
        title="Your performances",
    )


def get_profit_scatter_charts(tournaments: list[TournamentSummary]):
    """
    Get profit scatter chart.
    """
    non_freerolls = [t for t in tournaments if t.buy_in > 0]
    df_base = pd.DataFrame(
        {
            "Buy In": [t.buy_in for t in non_freerolls],
            "Relative Prize": [t.my_prize / t.buy_in for t in non_freerolls],
            "Prize Ratio": [t.my_prize / t.total_prize_pool for t in non_freerolls],
            "Total Entries": [t.total_players for t in non_freerolls],
            "Tournament Brand": [
                TournamentBrand.find(t.name).name for t in non_freerolls
            ],
            "Profitable": [t.profit > 0 for t in non_freerolls],
        }
    )
    df_base["Dot Size Multiplier"] = df_base["Relative Prize"].apply(
        lambda x: max(1 / 3.0, x ** (1 / 3.0))
    )

    figure1 = make_subplots(
        1,
        2,
        shared_yaxes=True,
        column_titles=["By Buy In amount", "By Total Entries"],
        y_title="Relative Prize Return",
        horizontal_spacing=0.05,
    )
    common_options = {
        "y": df_base["Relative Prize"],
        "mode": "markers",
        "marker_symbol": "circle",
    }

    figure1.add_trace(
        plgo.Scatter(
            x=df_base["Buy In"],
            name="RR by Buy In",
            **common_options,
        ),
        row=1,
        col=1,
    )
    figure1.add_trace(
        plgo.Scatter(
            x=df_base["Total Entries"],
            name="RR by Entries",
            **common_options,
        ),
        row=1,
        col=2,
    )
    figure1.update_xaxes(type="log")
    figure1.update_yaxes(type="log")

    figure2 = px.scatter(
        df_base,
        x="Total Entries",
        y="Buy In",
        size="Dot Size Multiplier",
        hover_data=["Relative Prize", "Prize Ratio"],
        color="Profitable",
        log_x=True,
        log_y=True,
        title="ITM Scatters",
        size_max=60,
    )

    return [figure1, figure2]


def plot_total(
    tournaments: typing.Iterable[TournamentSummary],
    sort_key: typing.Callable[[TournamentSummary], typing.Any] = (
        lambda t: t.sorting_key()
    ),
    max_data_points: int = 2000,
) -> str:
    """
    Plots the total prize pool of tournaments.
    """
    tournaments = sorted(tournaments, key=sort_key)
    figures = [
        get_profit_line_chart(tournaments, max_data_points=max_data_points),
        *get_profit_scatter_charts(tournaments),
    ]
    return BASE_HTML_FRAME % (
        "\n".join(
            fig.to_html(include_plotlyjs="cdn", full_html=False) for fig in figures
        )
    )
