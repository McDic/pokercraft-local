//! Equity calculations and relative analysis.

use itertools::Itertools;
use pyo3::prelude::*;
use rayon::prelude::*;

use crate::card::{Card, HandRank};
use crate::errors::PokercraftLocalError;

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
}
