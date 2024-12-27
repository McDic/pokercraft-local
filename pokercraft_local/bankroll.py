import math

from pokercraft_local_bankroll import BankruptcyMetric, calculate

from .data_structures import TournamentSummary


def analyze_bankroll(
    summaries: list[TournamentSummary],
    *,
    initial_capital_and_exits: tuple[tuple[int | float, float], ...],
    max_iteration: int,
    simulation_count: int,
) -> dict[int | float, BankruptcyMetric]:
    """
    Analyze bankroll with the given summaries.
    """
    relative_returns: list[float] = []
    for summary in summaries:
        relative_returns.extend(summary.rrs)

    results: dict[int | float, BankruptcyMetric] = {}
    for initial_capital, profit_exit_multiplier in initial_capital_and_exits:
        results[initial_capital] = calculate(
            initial_capital,
            relative_returns,
            max_iteration,
            profit_exit_multiplier,
            simulation_count,
        )
    return results
