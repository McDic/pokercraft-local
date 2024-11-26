import math
import typing

import numpy as np
import pandas as pd  # type: ignore [import-untyped]
import plotly.express as px  # type: ignore [import-untyped]
import plotly.graph_objects as plgo  # type: ignore [import-untyped]
from plotly.subplots import make_subplots  # type: ignore [import-untyped]

from .data_structures import TournamentBrand, TournamentSummary

BASE_HTML_FRAME: typing.Final[
    str
] = """
<html>
<head><meta charset="utf-8" /></head>
<body>
<h1>%s's realistic tournament performance on GGNetwork</h1>
<br>
%s
</body>
<br>
<h1>Generated by McDic's tool</h1>
</html>
"""

DEFAULT_WINDOW_SIZES: tuple[int, ...] = (50, 100, 200, 400, 800)


def get_historical_charts(
    tournaments: list[TournamentSummary],
    max_data_points: int = 2000,
    window_sizes: tuple[int, ...] = DEFAULT_WINDOW_SIZES,
):
    """
    Get historical charts.
    """
    df_base = pd.DataFrame(
        {
            "Tournament Name": [t.name for t in tournaments],
            "Time": [t.start_time for t in tournaments],
            "Profit": [t.profit for t in tournaments],
            "Rake": [t.rake * t.my_entries for t in tournaments],
            "Profitable": [1 if t.profit > 0 else 0 for t in tournaments],
            "Buy In": [t.buy_in for t in tournaments],
        }
    )
    df_base["Net Profit"] = df_base["Profit"].cumsum()
    df_base["Net Rake"] = df_base["Rake"].cumsum()
    df_base["Ideal Profit w.o. Rake"] = df_base["Net Profit"] + df_base["Net Rake"]
    df_base.index += 1

    # Profitable ratio
    profitable_expanding = df_base["Profitable"].expanding()
    df_base["Profitable Ratio"] = (
        profitable_expanding.sum() / profitable_expanding.count()
    )
    for window_size in window_sizes:
        this_title = f"Profitable Ratio W{window_size}"
        df_base[this_title] = (
            df_base["Profitable"].rolling(window_size).sum() / window_size
        )

    # Avg buy-in
    buyin_expanding = df_base["Buy In"].expanding()
    df_base["Avg Buy In"] = buyin_expanding.sum() / buyin_expanding.count()
    for window_size in window_sizes:
        this_title = f"Avg Buy In W{window_size}"
        df_base[this_title] = df_base["Buy In"].rolling(window_size).mean()

    # Resampling
    df_base = df_base.iloc[:: max(1, math.ceil(len(df_base) / max_data_points)), :]

    figure = make_subplots(
        rows=3,
        cols=1,
        shared_xaxes=True,
        row_titles=["Net Profit & Rake", "Profitable Ratio", "Average Buy In"],
        x_title="Tournament Count",
        vertical_spacing=0.01,
    )
    common_options = {
        "x": df_base.index,
        "mode": "lines",
        "customdata": np.stack((df_base["Tournament Name"],), axis=-1),
    }

    for col in ("Net Profit", "Net Rake", "Ideal Profit w.o. Rake"):
        figure.add_trace(
            plgo.Scatter(
                y=df_base[col],
                legendgroup="Profit",
                legendgrouptitle_text="Profits & Rakes",
                name=col,
                hovertemplate="%{y:$,.2f}",
                **common_options,
            ),
            row=1,
            col=1,
        )

    for window_size in (0,) + window_sizes:
        pr_col = (
            "Profitable Ratio"
            if window_size == 0
            else f"Profitable Ratio W{window_size}"
        )
        name = "Since 0" if window_size == 0 else f"Recent {window_size}"

        figure.add_trace(
            plgo.Scatter(
                y=df_base[pr_col],
                meta=[y * 100 for y in df_base[pr_col]],
                legendgroup="Profitable Ratio",
                legendgrouptitle_text="Profitable Ratio",
                name=name,
                hovertemplate="%{meta:.3f}%",
                **common_options,
            ),
            row=2,
            col=1,
        )
        avb_col = "Avg Buy In" if window_size == 0 else f"Avg Buy In W{window_size}"
        figure.add_trace(
            plgo.Scatter(
                y=df_base[avb_col],
                legendgroup="Avg Buy In",
                legendgrouptitle_text="Avg Buy In",
                name=name,
                hovertemplate="%{y:$,.2f}",
                **common_options,
            ),
            row=3,
            col=1,
        )

    figure.add_hline(
        y=0,
        line_color="red",
        line_dash="dash",
        row=1,
        col=1,
        label={
            "text": "Break-even",
            "textposition": "end",
            "font": {"color": "red"},
            "yanchor": "bottom",
        },
    )
    figure.update_layout(
        title="Historical Performance",
        hovermode="x unified",
        yaxis1={"tickformat": "$"},
        yaxis2={"tickformat": "%"},
        yaxis3={"tickformat": "$"},
    )
    figure.update_yaxes(row=3, col=1, patch={"type": "log"})
    figure.update_traces(xaxis="x3")
    return figure


def get_profit_scatter_charts(tournaments: list[TournamentSummary]):
    """
    Get profit scatter chart.
    """
    non_freerolls = [t for t in tournaments if t.buy_in > 0]
    df_base = pd.DataFrame(
        {
            "Tournament Name": [t.name for t in non_freerolls],
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
        column_titles=[
            "By Buy In amount (Nonzero profit only)",
            "By Total Entries (Nonzero profit only)",
        ],
        y_title="Relative Prize Return",
        horizontal_spacing=0.01,
    )
    common_options = {
        "y": df_base["Relative Prize"],
        "mode": "markers",
        "marker_symbol": "circle",
        "customdata": np.stack((df_base["Tournament Name"],), axis=-1),
    }

    figure1.add_trace(
        plgo.Scatter(
            x=df_base["Buy In"],
            name="RR by Buy In",
            hovertemplate="RR=%{y:.2f}<br>BuyIn=%{x:.2f}<br>Name=%{customdata[0]}",
            **common_options,
        ),
        row=1,
        col=1,
    )
    figure1.add_trace(
        plgo.Scatter(
            x=df_base["Total Entries"],
            name="RR by Entries",
            hovertemplate="RR=%{y:.2f}<br>TotalEntries=%{x:.2f}"
            "<br>Name=%{customdata[0]}",
            **common_options,
        ),
        row=1,
        col=2,
    )
    figure1.update_layout(title="Relative Prize Returns")
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
        size_max=45,
    )

    return [figure1, figure2]


def plot_total(
    nickname: str,
    tournaments: typing.Iterable[TournamentSummary],
    sort_key: typing.Callable[[TournamentSummary], typing.Any] = (
        lambda t: t.sorting_key()
    ),
    max_data_points: int = 2000,
    window_sizes: tuple[int, ...] = DEFAULT_WINDOW_SIZES,
) -> str:
    """
    Plots the total prize pool of tournaments.
    """
    tournaments = sorted(tournaments, key=sort_key)
    figures = [
        get_historical_charts(
            tournaments,
            max_data_points=max_data_points,
            window_sizes=window_sizes,
        ),
        *get_profit_scatter_charts(tournaments),
    ]
    return BASE_HTML_FRAME % (
        nickname,
        "\n".join(
            fig.to_html(include_plotlyjs=("cdn" if i == 0 else False), full_html=False)
            for i, fig in enumerate(figures)
        ),
    )
