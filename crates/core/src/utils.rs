/// An iterator that yields all combinations
/// of `K` elements from a list of candidates.
#[derive(Debug, Clone)]
pub struct FixedSizedCombinationIterator<T, const K: usize> {
    candidates: Vec<T>,
    idxes: [usize; K],
    finished: bool,
}

impl<T, const K: usize> FixedSizedCombinationIterator<T, K> {
    pub fn new<I>(candidates: I) -> Self
    where
        I: Iterator<Item = T>,
    {
        let mut idxes = [0; K];
        for i in 0..K {
            idxes[i] = i;
        }
        let candidates: Vec<_> = candidates.collect();
        let finished = K == 0 || candidates.len() < K;
        Self {
            candidates,
            idxes,
            finished,
        }
    }

    /// Internal method to increment the idxes to the next combination.
    /// Do not call this method directly.
    fn increment_idxes(&mut self) -> () {
        let n = self.candidates.len();
        let mut done_loop = false;
        for i in (0..K).rev() {
            if self.idxes[i] < n - (K - i) {
                self.idxes[i] += 1;
                for j in (i + 1)..K {
                    self.idxes[j] = self.idxes[j - 1] + 1;
                }
                done_loop = true;
                break;
            }
        }
        self.finished |= K == 0 || n < K || self.idxes[K - 1] >= n || !done_loop;
    }
}

impl<T, const K: usize> Iterator for FixedSizedCombinationIterator<T, K>
where
    T: Copy,
{
    type Item = [T; K];

    fn next(&mut self) -> Option<Self::Item> {
        if self.finished {
            None
        } else {
            let result = self.idxes.map(|idx| self.candidates[idx]);
            self.increment_idxes();
            Some(result)
        }
    }
}

/// A wrapper around an iterator.
/// For unknown reason `Box<dyn Iterator<Item = T>>`
/// does not implement `rayon::iter::ParallelBridge`.
pub struct IterWrapper<T> {
    pub iter: Box<dyn Iterator<Item = T> + Send>,
}

impl<T> Iterator for IterWrapper<T>
where
    T: Send,
{
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        self.iter.next()
    }
}

#[cfg(test)]
mod tests {
    use itertools::Itertools;

    use super::*;
    use crate::errors::PokercraftLocalError;

    #[test]
    fn test_fixed_sized_combination_iterator() -> Result<(), PokercraftLocalError> {
        let candidates = ["apple", "banana", "cherry", "duel", "egg", "fox", "grape"];
        let mut iter1 =
            FixedSizedCombinationIterator::<&'static str, 4>::new(candidates.iter().copied());
        let mut iter2 = candidates.into_iter().combinations(4);
        loop {
            let v1 = iter1.next();
            let v2 = iter2.next();
            match (v1, v2) {
                (None, None) => {
                    break Ok(());
                }
                (Some(a), None) => {
                    return Err(PokercraftLocalError::GeneralError(format!(
                        "Iterator lengths do not match; FixedSize is longer: {:?}",
                        a
                    )))
                }
                (None, Some(b)) => {
                    return Err(PokercraftLocalError::GeneralError(format!(
                        "Iterator lengths do not match; Combination is longer: {:?}",
                        b
                    )))
                }
                (Some(v1), Some(v2)) => {
                    assert_eq!(v1.iter().len(), v2.len());
                    assert_eq!(v1, v2.as_slice());
                }
            }
        }
    }
}
