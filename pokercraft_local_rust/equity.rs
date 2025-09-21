//! Equity calculations and relative analysis.

use itertools::Itertools;
use pyo3::prelude::*;
use rayon::prelude::*;
use rustfft::{num_complex::Complex, FftPlanner};

use crate::card::{Card, HandRank};
use crate::errors::PokercraftLocalError;

/// Result of single equity calculation.
#[pyclass]
#[derive(Debug, Clone)]
pub struct EquityResult {
    wins: Vec<Vec<u64>>,
    loses: Vec<u64>,
}

impl EquityResult {
    /// Create a new `EquityResult` by calculating the win/loss
    /// counts for the given player and community cards.
    pub fn new(
        cards_people: Vec<(Card, Card)>,
        cards_community: Vec<Card>,
    ) -> Result<Self, PokercraftLocalError> {
        let remaining_cards = Card::all()
            .into_iter()
            .filter(|card| {
                !cards_people.iter().any(|(c1, c2)| card == c1 || card == c2)
                    && !cards_community.iter().any(|c| card == c)
            })
            .collect::<Vec<_>>();

        if cards_community.len() > 5 {
            return Err(PokercraftLocalError::GeneralError(
                "Too many community cards; Should have at most 5 cards".to_string(),
            ));
        }

        // This is the result
        let get_empty_wins = || vec![vec![0; cards_people.len()]; cards_people.len()];
        let get_empty_loses = || vec![0; cards_people.len()];

        let result = remaining_cards
            .into_iter()
            .combinations(5 - cards_community.len())
            .par_bridge()
            .map(|remaining_communities| {
                let mut card7: [Card; 7] = [Card::default(); 7];
                for (i, card) in cards_community
                    .iter()
                    .chain(remaining_communities.iter())
                    .enumerate()
                {
                    card7[i] = *card;
                }

                // Get best hand ranks for each person
                let mut best_ranks_people = vec![];
                for (c1, c2) in cards_people.iter() {
                    card7[5] = *c1;
                    card7[6] = *c2;
                    if let Ok((_, best_rank_this_person)) = HandRank::find_best5(card7) {
                        best_ranks_people.push(best_rank_this_person);
                    } else {
                        return Err(PokercraftLocalError::GeneralError(format!(
                            "Failed to evaluate hand rank: {:?}",
                            card7
                        )));
                    }
                }

                // Compare people hand ranks
                let mut best_rank = &best_ranks_people[0];
                let mut tied: Vec<usize> = vec![0];
                for (i, rank) in best_ranks_people.iter().enumerate().skip(1) {
                    if rank > best_rank {
                        best_rank = rank;
                        tied = vec![i];
                    } else if rank == best_rank {
                        tied.push(i);
                    }
                }

                let mut this_result: Vec<i32> = vec![0; cards_people.len()];

                // Increment lose counts for all people
                // Winners' lose counts will be decremented later
                for i in 0..cards_people.len() {
                    this_result[i] = -1;
                }

                // Update win/lose counts
                let number_of_ties = tied.len() - 1;
                for &i in tied.iter() {
                    this_result[i] = number_of_ties as i32;
                }

                Ok(this_result)
            })
            .try_fold(
                || (get_empty_wins(), get_empty_loses()),
                |(mut win_acc, mut lose_acc), res| match res {
                    Ok(this_result) => {
                        for (i, &val) in this_result.iter().enumerate() {
                            if val >= 0 {
                                win_acc[i][val as usize] += 1;
                            } else {
                                lose_acc[i] += 1;
                            }
                        }
                        Ok((win_acc, lose_acc))
                    }
                    Err(e) => Err(e),
                },
            )
            .try_reduce(
                || (get_empty_wins(), get_empty_loses()),
                |(mut win1, mut lose1), (win2, lose2)| {
                    for i in 0..win1.len() {
                        for j in 0..win1[i].len() {
                            win1[i][j] += win2[i][j];
                        }
                        lose1[i] += lose2[i];
                    }
                    Ok((win1, lose1))
                },
            )?;

        Ok(Self {
            wins: result.0,
            loses: result.1,
        })
    }

    /// Get the equity of the given player index (0-based).
    pub fn get_equity(&self, player_index: usize) -> Result<f64, PokercraftLocalError> {
        if player_index >= self.wins.len() {
            return Err(PokercraftLocalError::GeneralError(
                "Player index out of range".to_string(),
            ));
        }
        let total_wins: u64 = self.wins[player_index].iter().sum();
        let total_games: u64 = total_wins + self.loses[player_index];
        if total_games == 0 {
            Err(PokercraftLocalError::GeneralError(
                "No games played; Cannot calculate equity".to_string(),
            ))
        } else {
            Ok(self.wins[player_index]
                .iter()
                .enumerate()
                .fold(0.0, |acc, (ties, &count)| {
                    acc + (count as f64) / ((ties + 1) as f64)
                })
                / (total_games as f64))
        }
    }
}

#[pymethods]
impl EquityResult {
    /// Calculate the win/loss count for the given player and community cards.
    /// `result[i][c]` represents the count of scenarios where
    /// the `i`-th player wins with `c` other players having the same rank.
    #[new]
    pub fn new_py(cards_people: Vec<(Card, Card)>, cards_community: Vec<Card>) -> PyResult<Self> {
        match Self::new(cards_people, cards_community) {
            Ok(result) => Ok(result),
            Err(e) => Err(e.into()),
        }
    }

    /// Python-exported interface of `self.get_equity`.
    pub fn get_equity_py(&self, player_index: usize) -> PyResult<f64> {
        match self.get_equity(player_index) {
            Ok(equity) => Ok(equity),
            Err(e) => Err(e.into()),
        }
    }

    /// Check if the given player index (0-based) has never lost in all scenarios.
    pub fn never_lost(&self, player_index: usize) -> PyResult<bool> {
        if player_index >= self.wins.len() {
            return Err(PyErr::new::<pyo3::exceptions::PyIndexError, _>(
                "Player index out of range",
            ));
        }
        Ok(self.loses[player_index] == 0)
    }
}

/// Luck calculator using equity values and results.
/// Results have two `f64` values: equity (0.0 ~ 1.0) and win/lose (0.0 ~ 1.0).
/// Win/lose is represented as `1.0` for win and `0.0` for lose.
/// If there are ties, use fractional values (e.g., `0.5` for a two-way tie).
#[pyclass]
#[derive(Debug, Clone)]
pub struct LuckCalculator {
    results: Vec<(f64, f64)>, // (equity, winlose: 0.0 ~ 1.0)
}

impl LuckCalculator {
    /// Create a new empty `LuckCalculator`.
    pub fn new() -> Self {
        LuckCalculator { results: vec![] }
    }

    /// Add a new result to the calculator.
    pub fn add_result(&mut self, equity: f64, actual: f64) -> Result<(), PokercraftLocalError> {
        if equity < 0.0 || equity > 1.0 {
            return Err(PokercraftLocalError::GeneralError(
                "Equity must be between 0.0 and 1.0".to_string(),
            ));
        } else if equity == 0.0 && actual > 0.0 {
            return Err(PokercraftLocalError::GeneralError(
                "Cannot win with 0% equity".to_string(),
            ));
        } else if equity == 1.0 && actual < 1.0 {
            return Err(PokercraftLocalError::GeneralError(
                "Cannot lose with 100% equity".to_string(),
            ));
        } else {
            self.results.push((equity, actual));
        }
        Ok(())
    }

    /// Get an iterator over all equity values on both winning and losing.
    fn get_all_equity_iter<'a>(&'a self) -> impl Iterator<Item = &'a f64> {
        self.results.iter().map(|(equity, _actual)| equity)
    }

    /// Number of expected wincount based on equity values.
    fn expected_wincount(&self) -> f64 {
        self.get_all_equity_iter().sum::<f64>()
    }

    /// Get the variance of the results.
    fn variance(&self) -> f64 {
        self.get_all_equity_iter()
            .map(|e| e * (1.0 - e))
            .sum::<f64>()
    }

    /// Number of actual wincount.
    fn actual_wincount(&self) -> f64 {
        self.results
            .iter()
            .map(|(_equity, actual)| actual)
            .sum::<f64>()
    }

    /// Calculate the Z-score of the results.
    pub fn z_score(&self) -> Option<f64> {
        let n = self.results.len();
        if n == 0 {
            return None;
        }
        let numerator = self.actual_wincount() - self.expected_wincount();
        let denominator = self.variance().sqrt();
        Some(numerator / denominator)
    }

    /// Convolve two real-coefficient polynomials a and b.
    /// Returns coefficients of c(x) = a(x) * b(x).
    /// This implementation is provided by ChatGPT.
    fn convolve_real(a: &[f64], b: &[f64]) -> Vec<f64> {
        let need = a.len() + b.len() - 1;
        let mut n = 1usize;
        while n < need {
            n <<= 1;
        }

        let mut planner = FftPlanner::<f64>::new();
        let fft = planner.plan_fft_forward(n);
        let ifft = planner.plan_fft_inverse(n);

        // Pack as Complex<f64>
        let mut fa = vec![Complex { re: 0.0, im: 0.0 }; n];
        let mut fb = vec![Complex { re: 0.0, im: 0.0 }; n];
        for (i, &x) in a.iter().enumerate() {
            fa[i].re = x;
        }
        for (i, &x) in b.iter().enumerate() {
            fb[i].re = x;
        }

        // FFT
        fft.process(&mut fa);
        fft.process(&mut fb);

        // pointwise multiply
        for i in 0..n {
            fa[i] = fa[i] * fb[i];
        }

        // IFFT
        ifft.process(&mut fa);

        // normalize and extract real part
        let inv_n = 1.0 / (n as f64);
        let mut out = fa
            .iter()
            .take(need)
            .map(|z| z.re * inv_n)
            .collect::<Vec<_>>();

        // clean tiny negatives due to float noise
        for x in &mut out {
            if *x < 0.0 && *x > -1e-15 {
                *x = 0.0;
            }
        }
        out
    }

    /// Build the Poisson–Binomial PMF coefficients f[k] = Pr(W = k)
    /// using an FFT-based product tree.
    /// This implementation is provided by ChatGPT.
    fn poisson_binomial_pmf(ps: &[f64]) -> Vec<f64> {
        // start as a list of degree-1 polys: (1-p) + p x
        let mut polys: Vec<Vec<f64>> = ps.iter().map(|&p| vec![1.0 - p, p]).collect();

        // edge case: no trials
        if polys.is_empty() {
            return vec![1.0];
        }

        // Multiplying polynomials in pairs, building a binary tree
        while polys.len() > 1 {
            let mut next = Vec::with_capacity((polys.len() + 1) / 2);
            let mut i = 0;
            while i + 1 < polys.len() {
                let c = Self::convolve_real(&polys[i], &polys[i + 1]);
                next.push(c);
                i += 2;
            }
            if i < polys.len() {
                // odd one out, carry forward
                next.push(polys[i].clone());
            }
            polys = next;
        }

        // single polynomial remains: that's the pmf
        polys.pop().unwrap()
    }

    /// Calculate the upper-tail, lower-tail, and two-sided p-values
    fn tails_from_pmf(pmf: &[f64], w_obs: usize) -> (f64, f64, f64) {
        let n = pmf.len() - 1;
        assert!(w_obs <= n);
        let upper: f64 = pmf[w_obs..].iter().copied().sum(); // Pr(W >= w_obs)
        let lower: f64 = pmf[..=w_obs].iter().copied().sum(); // Pr(W <= w_obs)
        let two_sided = (2.0 * upper.min(lower)).min(1.0);
        (upper, lower, two_sided)
    }

    /// The public interface to get the tail p-values;
    /// Upper-tail, lower-tail, and two-sided p-values.
    pub fn tails(&self) -> Option<(f64, f64, f64)> {
        let ps: Vec<f64> = self.get_all_equity_iter().copied().collect();
        if ps.is_empty() {
            return None;
        }
        let pmf = Self::poisson_binomial_pmf(&ps);
        let w_obs = self.actual_wincount();
        Some(Self::tails_from_pmf(&pmf, w_obs as usize))
    }
}

#[pymethods]
impl LuckCalculator {
    /// Python constructor of `LuckCalculator`.
    #[new]
    pub fn new_py() -> PyResult<Self> {
        Ok(Self::new())
    }

    /// Python interface of `self.add_result`.
    pub fn add_result_py(&mut self, equity: f64, actual: f64) -> PyResult<()> {
        match self.add_result(equity, actual) {
            Ok(()) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    /// Python interface of `self.z_score`.
    pub fn z_score_py(&self) -> PyResult<f64> {
        match self.z_score() {
            Some(z) => Ok(z),
            None => Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "No results added; Cannot calculate Z-score",
            )),
        }
    }

    /// Python interface of `self.tails`.
    pub fn tails_py(&self) -> PyResult<(f64, f64, f64)> {
        match self.tails() {
            Some(tails) => Ok(tails),
            None => Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "No results added; Cannot calculate tail p-values",
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper function to assert the equity results.
    fn assert_equity(
        cards_people: Vec<(Card, Card)>,
        cards_community: Vec<Card>,
        expected_equities: Vec<f64>,
    ) -> Result<(), PokercraftLocalError> {
        let equity = EquityResult::new(cards_people, cards_community)?;
        for (i, &expected) in expected_equities.iter().enumerate() {
            let actual = equity.get_equity(i)?;
            assert!((actual - expected).abs() < 1e-4);
        }
        Ok(())
    }

    #[test]
    fn test_equity() -> Result<(), PokercraftLocalError> {
        assert_equity(
            vec![
                ("As".try_into()?, "Ad".try_into()?),
                ("Ks".try_into()?, "Kd".try_into()?),
            ],
            vec![],
            vec![0.8236 + 0.0054 / 2.0, 0.1709 + 0.0054 / 2.0],
        )?;

        assert_equity(
            vec![
                ("Ac".try_into()?, "Kc".try_into()?),
                ("6h".try_into()?, "7h".try_into()?),
            ],
            vec!["9d".try_into()?, "Td".try_into()?, "Jd".try_into()?],
            vec![0.6495 + 0.0566 / 2.0, 0.2939 + 0.0566 / 2.0],
        )?;

        assert_equity(
            vec![
                ("Ac".try_into()?, "Kc".try_into()?),
                ("6h".try_into()?, "7h".try_into()?),
                ("Ts".try_into()?, "Th".try_into()?),
            ],
            vec!["9d".try_into()?, "Td".try_into()?, "Jd".try_into()?],
            vec![
                0.1318 + 0.0620 / 3.0,
                0.1030 + 0.0620 / 3.0,
                0.7032 + 0.0620 / 3.0,
            ],
        )?;
        Ok(())
    }

    fn assert_almost_equal(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-6,
            "Expected {} but got {}",
            expected,
            actual
        );
    }

    #[test]
    fn test_luck_score() -> Result<(), PokercraftLocalError> {
        let mut luck = LuckCalculator::new();
        luck.add_result(0.3, 1.0)?;
        let (upper, lower, _) = luck.tails().unwrap();
        assert_almost_equal(upper, 0.3);
        assert_almost_equal(lower, 1.0);

        let mut luck = LuckCalculator::new();
        luck.add_result(0.2, 1.0)?;
        luck.add_result(0.5, 0.0)?;
        let (upper, lower, _) = luck.tails().unwrap();
        assert_almost_equal(upper, 0.6);
        assert_almost_equal(lower, 0.9);

        let mut luck = LuckCalculator::new();
        luck.add_result(0.2, 1.0)?;
        luck.add_result(0.5, 0.0)?;
        luck.add_result(0.8, 1.0)?;
        let (upper, lower, _) = luck.tails().unwrap();
        assert_almost_equal(upper, 0.5);
        assert_almost_equal(lower, 0.92);

        Ok(())
    }
}
