"""
A module for bankroll analysis and simulation functionalities.
"""

class BankruptcyMetric:
    """
    Represents a bankruptcy metric.
    """

    def len(self) -> int:
        """
        Get the number of simulations performed so far.
        """
        ...
    def get_bankruptcy_rate(self) -> float:
        """
        Get the bankruptcy rate. This is not cached.
        """
        ...
    def get_survival_rate(self) -> float:
        """
        Get the profitable rate. This is not cached.
        """
        ...
    def get_profitable_rate(self) -> float:
        """
        Get the profitable rate. This is not cached.
        """
        ...

def simulate(
    initial_capital: float,
    relative_return_results: list[float],
    max_iteration: int,
    profit_exit_multiplier: float,
    simulation_count: int,
) -> BankruptcyMetric:
    """
    Simulate the bankruptcy metric.
    """
    ...
