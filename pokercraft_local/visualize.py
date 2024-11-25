import typing

import pandas as pd  # type: ignore [import-untyped]
import plotly.express as px  # type: ignore [import-untyped]

from .data_structures import TournamentSummary


def plot_total(
    tournaments: typing.Iterable[TournamentSummary],
    sort_key: typing.Callable[[TournamentSummary], typing.Any] = (
        lambda t: t.start_time
    ),
) -> str:
    """
    Plots the total prize pool of tournaments.
    """
    tournaments = sorted(tournaments, key=sort_key)

    df = pd.DataFrame(
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
    df["Net Profit"] = df["Profit"].cumsum()
    fig = px.line(
        df,
        y="Net Profit",
        title="Your performances",
    )
    return fig.to_html(include_plotlyjs="cdn")
