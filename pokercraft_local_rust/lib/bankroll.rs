//! A module for bankroll analysis.

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use rand::{thread_rng, Rng};
use rayon::prelude::*;

/// Represents a bankruptcy metric.
#[pyclass]
pub struct BankruptcyMetric {
    /// Holds `(relative_return, iteration)` tuples.
    /// (Relative return = final capital / initial capital)
    simulated_results: Vec<(f64, u32)>,
}

impl BankruptcyMetric {
    /// Create a new instance with empty statistics.
    pub fn new<I>(v: I) -> Self
    where
        I: IntoIterator<Item = (f64, u32)>,
    {
        BankruptcyMetric {
            simulated_results: v.into_iter().collect(),
        }
    }

    /// Update the statistics with a new simulation result.
    pub fn push(&mut self, simulation_result: (f64, u32)) {
        self.simulated_results.push(simulation_result);
    }
}

#[pymethods]
impl BankruptcyMetric {
    /// Get the number of simulations performed so far.
    pub fn len(&self) -> usize {
        self.simulated_results.len()
    }

    /// Get the bankruptcy rate. This is not cached.
    pub fn get_bankruptcy_rate(&self) -> f64 {
        if self.simulated_results.is_empty() {
            return 0.0;
        }
        (self
            .simulated_results
            .iter()
            .filter(|(capital, _it)| *capital <= 0.0)
            .count() as f64)
            / (self.len() as f64)
    }

    /// Get the survival rate. This is not cached.
    pub fn get_survival_rate(&self) -> f64 {
        if self.simulated_results.is_empty() {
            return 0.0;
        }
        (self
            .simulated_results
            .iter()
            .filter(|(capital, _it)| *capital > 0.0)
            .count() as f64)
            / (self.len() as f64)
    }

    /// Get the profitable rate. This is not cached.
    pub fn get_profitable_rate(&self) -> f64 {
        if self.simulated_results.is_empty() {
            return 0.0;
        }
        (self
            .simulated_results
            .iter()
            .filter(|(capital, _it)| *capital > 1.0)
            .count() as f64)
            / (self.len() as f64)
    }
}

impl Default for BankruptcyMetric {
    fn default() -> Self {
        Self::new(std::iter::empty())
    }
}

/// Simulate the bankruptcy metric.
#[pyfunction]
pub fn simulate(
    initial_capital: f64,
    relative_return_results: Vec<f64>,
    max_iteration: u32,
    profit_exit_multiplier: f64,
    simulation_count: u32,
) -> PyResult<BankruptcyMetric> {
    if initial_capital <= 0.0 {
        return Err(PyValueError::new_err("Initial capital must be positive"));
    } else if relative_return_results.is_empty() {
        return Err(PyValueError::new_err(
            "Relative return results must not be empty",
        ));
    } else if max_iteration < 1 {
        return Err(PyValueError::new_err("Max iteration must be positive"));
    } else if relative_return_results.iter().sum::<f64>() < 0.0 {
        return Err(PyValueError::new_err(
            "Total relative returns are negative; Bankruptcy in long run is guaranteed",
        ));
    } else if simulation_count < 1 {
        return Err(PyValueError::new_err("Simulation count must be positive"));
    }

    let metric = BankruptcyMetric::new(
        (0..simulation_count)
            .into_par_iter()
            .map(|_| {
                simple_monte_carlo_loop(
                    initial_capital,
                    &relative_return_results,
                    max_iteration,
                    Some(profit_exit_multiplier),
                )
            })
            .collect::<Vec<_>>(),
    );
    Ok(metric)
}

/// Simple Monte Carlo simulation loop;
/// Returns the final value of the portfolio (0.0 if bankrupted)
/// and bankrupted iteration number (0 if not bankrupted).
/// If there is an error on value of parameters,
/// no simulation will be done
/// and the function will return `(0.0, 0)`.
fn simple_monte_carlo_loop(
    initial_capital: f64,
    relative_return_results: &Vec<f64>,
    max_iteration: u32,
    profit_exit_multiplier: Option<f64>,
) -> (f64, u32) {
    if initial_capital <= 0.0
        || relative_return_results.is_empty()
        || max_iteration < 1
        || relative_return_results.iter().sum::<f64>() < 0.0
    {
        return (0.0, 0);
    }
    let exit_capital: f64 = match profit_exit_multiplier {
        Some(profit_exit_multiplier) => {
            if profit_exit_multiplier >= 1.0 {
                initial_capital * profit_exit_multiplier
            } else {
                f64::MAX
            }
        }
        None => f64::MAX,
    };
    let mut rng = thread_rng();
    let mut capital = initial_capital;
    for i in 0..max_iteration {
        let idx: usize = rng.gen_range(0..relative_return_results.len());
        capital += relative_return_results[idx];
        if capital <= 0.0 {
            // Bankrupted
            return (0.0, i + 1);
        } else if capital >= exit_capital {
            // Exit if profit is reached
            return (capital / initial_capital, 0);
        }
    }
    (f64::max(capital / initial_capital, 0.0), 0)
}
