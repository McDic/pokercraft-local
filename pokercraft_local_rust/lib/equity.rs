//! Equity calculations and relative analysis.

use std::collections::HashMap;
use std::io::BufRead;

use flate2::read::GzDecoder;
use pyo3::prelude::*;
use rayon::prelude::*;
use rustfft::{num_complex::Complex, FftPlanner};
use statrs::distribution::{ContinuousCDF, Normal};

use crate::card::{Card, Hand, HandRank};
use crate::errors::PokercraftLocalError;
use crate::utils::{FixedSizedCombinationIterator, IterWrapper};

/// Result of single equity calculation.
#[pyclass]
#[derive(Debug, Clone)]
pub struct EquityResult {
    /// `wins[i][c]` is number of `i`-th player wins
    /// with `c` other players having the same rank.
    wins: Vec<Vec<u64>>,
    /// `loses[i]` is number of `i`-th player loses.
    loses: Vec<u64>,
}

impl EquityResult {
    /// Chain an array of `N` cards and a slice of fixed cards into a 5-card array.
    /// This is a helper function, do not call this directly.
    fn chain5<const N: usize>(arr: [Card; N], fixed: &[Card]) -> [Card; 5] {
        let mut result = [Card::default(); 5];
        let mut idx = 0;
        for &card in fixed {
            result[idx] = card;
            idx += 1;
        }
        for &card in arr.iter() {
            result[idx] = card;
            idx += 1;
        }
        result
    }

    /// Get an iterator over all possible 5-card flops.
    /// This is a helper function, do not call this directly.
    fn get_flop_iter(
        remaining_cards: Vec<Card>,
        fixed_communities: Vec<Card>,
    ) -> Result<Box<dyn Iterator<Item = [Card; 5]> + Send>, PokercraftLocalError> {
        match fixed_communities.len() {
            0 => Ok(Box::new(FixedSizedCombinationIterator::<Card, 5>::new(
                remaining_cards.into_iter(),
            ))),
            1 => Ok(Box::new(
                FixedSizedCombinationIterator::<Card, 4>::new(remaining_cards.into_iter())
                    .map(move |arr| Self::chain5(arr, &fixed_communities)),
            )),
            2 => Ok(Box::new(
                FixedSizedCombinationIterator::<Card, 3>::new(remaining_cards.into_iter())
                    .map(move |arr| Self::chain5(arr, &fixed_communities)),
            )),
            3 => Ok(Box::new(
                FixedSizedCombinationIterator::<Card, 2>::new(remaining_cards.into_iter())
                    .map(move |arr| Self::chain5(arr, &fixed_communities)),
            )),
            4 => Ok(Box::new(
                FixedSizedCombinationIterator::<Card, 1>::new(remaining_cards.into_iter())
                    .map(move |arr| Self::chain5(arr, &fixed_communities)),
            )),
            5 => Ok(Box::new(std::iter::once(Self::chain5(
                [Card::default(); 0],
                &fixed_communities,
            )))),
            len => Err(PokercraftLocalError::GeneralError(format!(
                "Given {} fixed community cards; Cannot generate the 5-cards flop.",
                len
            ))),
        }
    }

    /// Calculate the win/lose counts for a single board.
    fn single_board_calculation(
        communities: [Card; 5],
        cards_people: &[Hand],
    ) -> Result<Vec<i32>, PokercraftLocalError> {
        let mut card7: [Card; 7] = [Card::default(); 7];
        for (i, card) in communities.into_iter().enumerate() {
            card7[i] = card;
        }

        // Get best hand ranks for each person
        let best_ranks_people = cards_people
            .iter()
            .map(|&(c1, c2)| {
                card7[5] = c1;
                card7[6] = c2;
                if let Ok((_, best_rank_this_person)) = HandRank::find_best5(&card7) {
                    Ok(best_rank_this_person)
                } else {
                    Err(PokercraftLocalError::GeneralError(format!(
                        "Failed to evaluate hand rank: {:?}",
                        card7
                    )))
                }
            })
            .collect::<Result<Vec<_>, PokercraftLocalError>>()?;

        // Compare people hand ranks
        let mut best_rank = &best_ranks_people[0];
        let mut tied: Vec<usize> = Vec::with_capacity(8);
        tied.push(0);
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
    }

    /// A helper function for `try_fold` in folding results.
    fn folding_fn(
        (mut win_acc, mut lose_acc): (Vec<Vec<u64>>, Vec<u64>),
        res: Result<Vec<i32>, PokercraftLocalError>,
    ) -> Result<(Vec<Vec<u64>>, Vec<u64>), PokercraftLocalError> {
        match res {
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
        }
    }

    /// Helper function to create empty win/lose counts.
    fn get_empty_winloses(num_players: usize) -> (Vec<Vec<u64>>, Vec<u64>) {
        (
            vec![vec![0; num_players]; num_players],
            vec![0; num_players],
        )
    }

    /// Create a new `EquityResult` by calculating the win/loss
    /// counts for the given player and community cards.
    pub fn new(
        cards_people: Vec<Hand>,
        cards_community: Vec<Card>,
        parallel_calculation: bool,
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
        } else if cards_people.is_empty() {
            return Err(PokercraftLocalError::GeneralError(
                "No player cards given".to_string(),
            ));
        } else if cards_people.len() > 23 {
            return Err(PokercraftLocalError::GeneralError(
                "Too many players; Should have at most 23 players".to_string(),
            ));
        }

        let iter = IterWrapper {
            iter: Self::get_flop_iter(remaining_cards, cards_community)?,
        };
        let num_players = cards_people.len();

        let result = if parallel_calculation {
            iter.par_bridge()
                .map(|communities| Self::single_board_calculation(communities, &cards_people))
                .try_fold(|| Self::get_empty_winloses(num_players), Self::folding_fn)
                .try_reduce(
                    || Self::get_empty_winloses(num_players),
                    |(mut win1, mut lose1), (win2, lose2)| {
                        for i in 0..win1.len() {
                            for j in 0..win1[i].len() {
                                win1[i][j] += win2[i][j];
                            }
                            lose1[i] += lose2[i];
                        }
                        Ok((win1, lose1))
                    },
                )
        } else {
            iter.map(|communities| Self::single_board_calculation(communities, &cards_people))
                .try_fold(Self::get_empty_winloses(num_players), Self::folding_fn)
        }?;

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

    /// Get the (win/tie counts, lose count)
    /// of the given player index (0-based).
    /// The structure of return values are exactly same as
    /// `self.wins[player_index]` and `self.loses[player_index]`.
    pub fn get_winlosses(
        &self,
        player_index: usize,
    ) -> Result<(Vec<u64>, u64), PokercraftLocalError> {
        if player_index >= self.wins.len() {
            return Err(PokercraftLocalError::GeneralError(
                "Player index out of range".to_string(),
            ));
        }
        Ok((self.wins[player_index].clone(), self.loses[player_index]))
    }
}

#[pymethods]
impl EquityResult {
    /// Calculate the win/loss count for the given player and community cards.
    /// `result[i][c]` represents the count of scenarios where
    /// the `i`-th player wins with `c` other players having the same rank.
    #[new]
    pub fn new_py(cards_people: Vec<(Card, Card)>, cards_community: Vec<Card>) -> PyResult<Self> {
        Self::new(cards_people, cards_community, true).map_err(|e| e.into())
    }

    /// Python-exported interface of `self.get_equity`.
    pub fn get_equity_py(&self, player_index: usize) -> PyResult<f64> {
        self.get_equity(player_index).map_err(|e| e.into())
    }

    /// Python-exported interface of `self.get_winloses`.
    pub fn get_winlosses_py(&self, player_index: usize) -> PyResult<(Vec<u64>, u64)> {
        self.get_winlosses(player_index).map_err(|e| e.into())
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

/// Preflop equity cache for heads-up situations.
#[pyclass]
pub struct HUPreflopEquityCache {
    /// `{(card_a1, card_a2), (card_b1, card_b2)): (P1 win, P2 win, tie)}`
    cache: HashMap<(Hand, Hand), (u64, u64, u64)>,
}

impl HUPreflopEquityCache {
    /// Create a `HUPreflopEquityCache` from pre-computed cache file.
    /// Followings are line examples:
    /// - `TsQh vs QsTd = 1376857 31189 304258`
    /// - `6sTh vs 9s8d = 940755 738123 33426`
    pub fn new(path: &std::path::Path) -> Result<Self, PokercraftLocalError> {
        let file = std::fs::OpenOptions::new().read(true).open(path)?;
        let decoder = GzDecoder::new(file);
        let reader = std::io::BufReader::new(decoder);
        let mut cache: HashMap<(Hand, Hand), (u64, u64, u64)> = HashMap::new();
        for (i, line) in reader.lines().enumerate() {
            let line: String = line?;
            let parts = line.trim().split_whitespace().collect::<Vec<_>>();
            if parts.len() != 7 {
                return Err(PokercraftLocalError::GeneralError(format!(
                    "Invalid format in cache file line {}: {}",
                    i + 1,
                    line
                )));
            } else if parts[1] != "vs" {
                return Err(PokercraftLocalError::GeneralError(format!(
                    "Invalid format (\"vs\" not present) in cache file line {}: {}",
                    i + 1,
                    line
                )));
            } else if parts[3] != "=" {
                return Err(PokercraftLocalError::GeneralError(format!(
                    "Invalid format (\"=\" not present) in cache file line {}: {}",
                    i + 1,
                    line
                )));
            } else if parts[0].len() != 4 || parts[2].len() != 4 {
                return Err(PokercraftLocalError::GeneralError(format!(
                    "Invalid hand format in cache file line {}: {}",
                    i + 1,
                    line
                )));
            }

            let hand1_win_res = parts[4].parse::<u64>();
            let hand2_win_res = parts[5].parse::<u64>();
            let tie_res = parts[6].parse::<u64>();
            if let (Ok(hand1_win), Ok(hand2_win), Ok(tie)) = (hand1_win_res, hand2_win_res, tie_res)
            {
                let hand1 = (
                    Card::try_from(&parts[0][0..2])?,
                    Card::try_from(&parts[0][2..4])?,
                );
                let hand2 = (
                    Card::try_from(&parts[2][0..2])?,
                    Card::try_from(&parts[2][2..4])?,
                );
                for (other_keys, _is_swapped) in Self::possible_keys_l3(hand1, hand2) {
                    if cache.contains_key(&other_keys) {
                        return Err(PokercraftLocalError::GeneralError(format!(
                            "Duplicate entry in cache file line {}: {}",
                            i + 1,
                            line
                        )));
                    }
                }
                cache.insert((hand1, hand2), (hand1_win, hand2_win, tie));
            } else {
                return Err(PokercraftLocalError::GeneralError(format!(
                    "Invalid win/tie counts in cache file line {}: {}",
                    i + 1,
                    line
                )));
            }
        }
        Ok(Self { cache })
    }

    /// Possible Keys Layer 1: Get possible card pairs considering card-swap.
    /// There are 2 scenarios `(AB, BA)`.
    const fn possible_keys_l1(card1: Card, card2: Card) -> [Hand; 2] {
        [(card1, card2), (card2, card1)]
    }

    /// Possible Keys Layer 2: Get possible hand pairs considering player-swap on top of Layer 1.
    /// There are 2x2x2 = 8 scenarios `(AB, BA, A*B, BA*, AB*, B*A, A*B*, B*A*)`.
    /// The last boolean value indicates whether the hands are swapped.
    fn possible_keys_l2(
        (card_a1, card_a2): Hand,
        (card_b1, card_b2): Hand,
    ) -> [((Hand, Hand), bool); 8] {
        let mut result: [((Hand, Hand), bool); 8] = [Default::default(); 8];
        let mut idx: usize = 0;
        for hand_a in Self::possible_keys_l1(card_a1, card_a2) {
            for hand_b in Self::possible_keys_l1(card_b1, card_b2) {
                result[idx] = ((hand_a, hand_b), false);
                idx += 1;
                result[idx] = ((hand_b, hand_a), true);
                idx += 1;
            }
        }
        result
    }

    /// Possible Keys Layer 3: Get possible hand pairs considering suit symmetries on top of Layer 2.
    /// There are 8x24 = 192 scenarios in total.
    /// The last boolean value indicates whether the hands are swapped.
    pub fn possible_keys_l3(
        (card_a1, card_a2): Hand,
        (card_b1, card_b2): Hand,
    ) -> [((Hand, Hand), bool); 8 * 24] {
        let mut result: [((Hand, Hand), bool); 8 * 24] = [Default::default(); 8 * 24];
        let mut idx: usize = 0;
        for [card_a1, card_a2, card_b1, card_b2] in
            crate::card::all_canonical_symmetries(&[card_a1, card_a2, card_b1, card_b2])
        {
            for ((sym_hand_a, sym_hand_b), swapped) in
                Self::possible_keys_l2((card_a1, card_a2), (card_b1, card_b2))
            {
                result[idx] = ((sym_hand_a, sym_hand_b), swapped);
                idx += 1;
            }
        }
        result
    }

    /// Get the equity from the cache.
    pub fn get_winlose(
        &self,
        hand1: (Card, Card),
        hand2: (Card, Card),
    ) -> Result<(u64, u64, u64), PokercraftLocalError> {
        for ((possible_hand1, possible_hand2), is_swapped) in Self::possible_keys_l3(hand1, hand2) {
            if let Some(&(win1, win2, tie)) = self.cache.get(&(possible_hand1, possible_hand2)) {
                return if is_swapped {
                    Ok((win2, win1, tie))
                } else {
                    Ok((win1, win2, tie))
                };
            }
        }
        Err(PokercraftLocalError::GeneralError(format!(
            "No cache entry found for the given hands {}{} vs {}{}",
            hand1.0, hand1.1, hand2.0, hand2.1
        )))
    }
}

#[pymethods]
impl HUPreflopEquityCache {
    /// Create a `HUPreflopEquityCache` from pre-computed cache file.
    #[new]
    pub fn new_py(path: std::path::PathBuf) -> PyResult<Self> {
        Self::new(&path).map_err(|e| e.into())
    }

    /// Get the P1 win, P2 win, and tie counts from the cache.
    pub fn get_winlose_py(
        &self,
        hand1: (Card, Card),
        hand2: (Card, Card),
    ) -> PyResult<(u64, u64, u64)> {
        self.get_winlose(hand1, hand2).map_err(|e| e.into())
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

    /// Number of actual wincount.
    fn actual_wincount(&self) -> f64 {
        self.results
            .iter()
            .map(|(_equity, actual)| actual)
            .sum::<f64>()
    }

    /// Calculate the Luck-score of the results.
    /// `Luck = sign(actual - expected) * GaussianCDF^{-1}(1 - p_tail)`
    pub fn luck_score(&self) -> Option<f64> {
        let (_upper, lower, _two_sided) = match self.tails() {
            Some(tails) => tails,
            None => return None,
        };
        let guassian = Normal::new(0.0, 1.0).unwrap();
        const EPS: f64 = 1e-15;
        if lower < EPS {
            Some(f64::NEG_INFINITY)
        } else if lower < 1.0 - EPS {
            let luck = guassian.inverse_cdf(lower);
            Some(luck)
        } else {
            Some(f64::INFINITY)
        }
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

    /// Build the Poisson–Binomial PMF coefficients `f[k] = Pr(W = k)`
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

    /// Python interface of `self.luck_score`.
    pub fn luck_score_py(&self) -> PyResult<f64> {
        match self.luck_score() {
            Some(luck) => Ok(luck),
            None => Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "Cannot calculate Luck-score",
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
        let equity = EquityResult::new(cards_people, cards_community, true)?;
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
            (actual - expected).abs() < 1e-4,
            "Expected {} but got {}",
            expected,
            actual
        );
    }

    #[test]
    fn test_tails() -> Result<(), PokercraftLocalError> {
        let mut luck_calc = LuckCalculator::new();
        luck_calc.add_result(0.3, 1.0)?;
        let (upper, lower, _) = luck_calc.tails().unwrap();
        assert_almost_equal(upper, 0.3);
        assert_almost_equal(lower, 1.0);
        let luck = luck_calc.luck_score().unwrap();
        assert!(luck.is_infinite() && luck.is_sign_positive());

        let mut luck_calc = LuckCalculator::new();
        luck_calc.add_result(0.2, 1.0)?;
        luck_calc.add_result(0.5, 0.0)?;
        let (upper, lower, _) = luck_calc.tails().unwrap();
        assert_almost_equal(upper, 0.6);
        assert_almost_equal(lower, 0.9);
        let luck = luck_calc.luck_score().unwrap();
        assert_almost_equal(luck, 1.2816);

        let mut luck_calc = LuckCalculator::new();
        luck_calc.add_result(0.2, 1.0)?;
        luck_calc.add_result(0.5, 0.0)?;
        luck_calc.add_result(0.8, 1.0)?;
        let (upper, lower, _) = luck_calc.tails().unwrap();
        assert_almost_equal(upper, 0.5);
        assert_almost_equal(lower, 0.92);
        let luck = luck_calc.luck_score().unwrap();
        assert_almost_equal(luck, 1.405);

        Ok(())
    }
}
