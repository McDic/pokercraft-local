import math

from pokercraft_local_bankroll import BankruptcyMetric, calculate

from .data_structures import TournamentSummary


def analyze_bankroll(
    summaries: list[TournamentSummary],
    *,
    initial_capitals: tuple[int | float, ...],
    max_iteration: int,
    profit_exit_multiplier: float = 10.0,
    simulation_count: int = 25_000,
) -> dict[int | float, BankruptcyMetric]:
    """
    Analyze bankroll with the given summaries.
    """
    relative_returns: list[float] = [
        summary.relative_return
        for summary in summaries
        if not math.isnan(summary.relative_return)
    ]

    results: dict[int | float, BankruptcyMetric] = {}
    for initial_capital in initial_capitals:
        results[initial_capital] = calculate(
            initial_capital,
            relative_returns,
            max_iteration,
            profit_exit_multiplier,
            simulation_count,
        )
    return results
