//! Basic functionalities for poker hands.

use itertools::Itertools;
use pyo3::prelude::*;

use crate::{errors::PokercraftLocalError, utils::FixedSizedCombinationIterator};

pub const NUM_OF_SHAPES: usize = 4;
pub const NUM_OF_NUMBERS: usize = 13;

/// Card shapes (suits) in a standard deck of playing cards.
#[pyclass(eq)]
#[derive(PartialEq, Eq, Hash, Clone, Copy, Debug)]
pub enum CardShape {
    Spade,
    Heart,
    Diamond,
    Club,
}

impl CardShape {
    /// Return all card shapes.
    pub const fn all() -> [CardShape; NUM_OF_SHAPES] {
        [
            CardShape::Spade,
            CardShape::Heart,
            CardShape::Diamond,
            CardShape::Club,
        ]
    }
}

#[pymethods]
impl CardShape {
    fn __str__(&self) -> PyResult<String> {
        Ok(format!("{}", self))
    }
}

impl std::fmt::Display for CardShape {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let repr = match self {
            CardShape::Spade => "Spade",
            CardShape::Heart => "Heart",
            CardShape::Diamond => "Diamond",
            CardShape::Club => "Club",
        };
        write!(f, "{}", repr)
    }
}

impl Default for CardShape {
    fn default() -> Self {
        CardShape::Spade
    }
}

impl From<CardShape> for char {
    fn from(shape: CardShape) -> Self {
        match shape {
            CardShape::Spade => 's',
            CardShape::Heart => 'h',
            CardShape::Diamond => 'd',
            CardShape::Club => 'c',
        }
    }
}

impl TryFrom<char> for CardShape {
    type Error = PokercraftLocalError;

    fn try_from(value: char) -> Result<Self, Self::Error> {
        for shape in Self::all() {
            if char::from(shape) == value.to_ascii_lowercase() {
                return Ok(shape);
            }
        }
        Err(PokercraftLocalError::GeneralError(format!(
            "Invalid card shape: {}",
            value
        )))
    }
}

/// Card numbers (ranks) in a standard deck of playing cards.
#[pyclass(eq)]
#[derive(PartialEq, Eq, PartialOrd, Ord, Hash, Clone, Copy, Debug)]
pub enum CardNumber {
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
    Six = 6,
    Seven = 7,
    Eight = 8,
    Nine = 9,
    Ten = 10,
    Jack = 11,
    Queen = 12,
    King = 13,
    Ace = 14,
}

impl CardNumber {
    /// Return all card numbers.
    pub const fn all() -> [CardNumber; NUM_OF_NUMBERS] {
        [
            CardNumber::Two,
            CardNumber::Three,
            CardNumber::Four,
            CardNumber::Five,
            CardNumber::Six,
            CardNumber::Seven,
            CardNumber::Eight,
            CardNumber::Nine,
            CardNumber::Ten,
            CardNumber::Jack,
            CardNumber::Queen,
            CardNumber::King,
            CardNumber::Ace,
        ]
    }

    /// Create a `CardNumber` from an integer.
    pub fn new(num: i32) -> Option<CardNumber> {
        match num {
            1 => Some(CardNumber::Ace), // Allow 1 as Ace for convenience
            2 => Some(CardNumber::Two),
            3 => Some(CardNumber::Three),
            4 => Some(CardNumber::Four),
            5 => Some(CardNumber::Five),
            6 => Some(CardNumber::Six),
            7 => Some(CardNumber::Seven),
            8 => Some(CardNumber::Eight),
            9 => Some(CardNumber::Nine),
            10 => Some(CardNumber::Ten),
            11 => Some(CardNumber::Jack),
            12 => Some(CardNumber::Queen),
            13 => Some(CardNumber::King),
            14 => Some(CardNumber::Ace),
            _ => None,
        }
    }

    /// Check if this card number is the next of the
    /// given previous card number, in straight order. (A234567...QKA)
    pub fn is_next_in_cycle(&self, previous: &CardNumber) -> bool {
        if previous == &CardNumber::Ace {
            // 2 is next of Ace
            return self == &CardNumber::Two;
        } else {
            return (*self as u8) == (*previous as u8) + 1;
        }
    }
}

#[pymethods]
impl CardNumber {
    fn __str__(&self) -> PyResult<String> {
        Ok(format!("{}", self))
    }

    #[staticmethod]
    fn all_py() -> PyResult<[CardNumber; NUM_OF_NUMBERS]> {
        Ok(CardNumber::all())
    }
}

impl std::fmt::Display for CardNumber {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", Into::<char>::into(*self))
    }
}

impl Default for CardNumber {
    fn default() -> Self {
        CardNumber::Two
    }
}

impl TryFrom<i32> for CardNumber {
    type Error = PokercraftLocalError;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match CardNumber::new(value) {
            Some(num) => Ok(num),
            None => Err(PokercraftLocalError::GeneralError(format!(
                "Invalid card number: {}",
                value
            ))),
        }
    }
}

impl From<CardNumber> for char {
    fn from(number: CardNumber) -> Self {
        match number {
            CardNumber::Two => '2',
            CardNumber::Three => '3',
            CardNumber::Four => '4',
            CardNumber::Five => '5',
            CardNumber::Six => '6',
            CardNumber::Seven => '7',
            CardNumber::Eight => '8',
            CardNumber::Nine => '9',
            CardNumber::Ten => 'T',
            CardNumber::Jack => 'J',
            CardNumber::Queen => 'Q',
            CardNumber::King => 'K',
            CardNumber::Ace => 'A',
        }
    }
}

impl TryFrom<char> for CardNumber {
    type Error = PokercraftLocalError;

    fn try_from(value: char) -> Result<Self, Self::Error> {
        for number in Self::all() {
            if char::from(number) == value.to_ascii_uppercase() {
                return Ok(number);
            }
        }
        Err(PokercraftLocalError::GeneralError(format!(
            "Invalid card number: {}",
            value
        )))
    }
}

/// A playing card in a standard deck of 52 cards.
#[pyclass(eq)]
#[derive(PartialEq, Eq, Copy, Clone, Hash, Debug, Default)]
pub struct Card {
    pub shape: CardShape,
    pub number: CardNumber,
}

impl Card {
    /// Return all 52 cards in a standard deck.
    pub const fn all() -> [Card; NUM_OF_NUMBERS * NUM_OF_SHAPES] {
        let mut cards = [Card {
            shape: CardShape::Spade,
            number: CardNumber::Two,
        }; NUM_OF_NUMBERS * NUM_OF_SHAPES];
        const ALL_SHAPES: [CardShape; NUM_OF_SHAPES] = CardShape::all();
        const ALL_NUMBERS: [CardNumber; NUM_OF_NUMBERS] = CardNumber::all();
        let mut iteration: usize = 0;
        while iteration < (NUM_OF_NUMBERS * NUM_OF_SHAPES) {
            let shape = ALL_SHAPES[iteration / NUM_OF_NUMBERS];
            let number = ALL_NUMBERS[iteration % NUM_OF_NUMBERS];
            cards[iteration] = Card { shape, number };
            iteration += 1;
        }
        cards
    }
}

pub type Hand = (Card, Card);

#[pymethods]
impl Card {
    #[new]
    fn new_py(value: &str) -> PyResult<Self> {
        if let Ok(card) = Card::try_from(value) {
            Ok(card)
        } else {
            Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(format!(
                "Invalid card string: \"{}\"",
                value
            )))
        }
    }

    /// Get the number of this card.
    #[getter]
    fn get_number(&self) -> PyResult<CardNumber> {
        Ok(self.number)
    }

    /// Get the shape of this card.
    #[getter]
    fn get_shape(&self) -> PyResult<CardShape> {
        Ok(self.shape)
    }

    fn __str__(&self) -> PyResult<String> {
        Ok(format!("{}", self))
    }

    fn __repr__(&self) -> PyResult<String> {
        Ok(format!("Card(\"{}\")", self))
    }
}

impl std::fmt::Display for Card {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let number_char: char = self.number.into();
        let shape_char: char = self.shape.into();
        write!(f, "{}{}", number_char, shape_char)
    }
}

impl TryFrom<&str> for Card {
    type Error = PokercraftLocalError;

    /// Create a `Card` from a 2-character string.
    /// The first character represents the card number,
    /// and the second character represents the card shape.
    /// This is not case-sensitive.
    ///
    /// Examples:
    /// - "As" -> Ace of Spades
    /// - "Td" -> Ten of Diamonds
    /// - "5h" -> Five of Hearts
    fn try_from(value: &str) -> Result<Self, Self::Error> {
        if value.len() != 2 {
            return Err(PokercraftLocalError::GeneralError(format!(
                "Invalid card string: {}",
                value
            )));
        }
        let mut chars = value.chars();
        let number_char = chars.next().unwrap();
        let shape_char = chars.next().unwrap();
        let number = CardNumber::try_from(number_char)?;
        let shape = CardShape::try_from(shape_char)?;
        Ok(Card { shape, number })
    }
}

/// Represents the rank of a poker hand.
/// Due to the complex structure, this enum is not exported to Python.
/// `Eq` and `Ord` are intentionally not implemented for this enum,
/// and also `PartialEq` and `PartialOrd` are manually implemented
/// because we do not differentiate between same rank with different suits.
#[pyclass]
#[derive(Copy, Clone, Debug)]
pub enum HandRank {
    HighCard([Card; 5]),
    OnePair(CardNumber, [Card; 3]),
    TwoPairs(CardNumber, CardNumber, Card),
    Triple(CardNumber, [Card; 2]),
    Straight(CardNumber),
    Flush(CardShape, [CardNumber; 5]), // (Shape, Numbers)
    FullHouse(CardNumber, CardNumber), // (Three, Pair)
    Quads(CardNumber, Card),           // (Four, Kicker)
    StraightFlush(Card),               // Highest card in the straight flush
}

impl HandRank {
    /// Numerize the given kicker/high-card information
    /// into an integer for easy comparison.
    /// The early number has higher priority.
    fn numerize_kickers(front_numbers: &[&CardNumber], cards: &[Card]) -> u64 {
        let mut result: u64 = 0;
        for number in front_numbers.into_iter() {
            result *= NUM_OF_NUMBERS as u64;
            result += **number as u64;
        }
        for card in cards.iter() {
            result *= NUM_OF_NUMBERS as u64;
            result += card.number as u64;
        }
        result
    }

    /// Numerize the given cards for easy comparison.
    pub fn numerize(&self) -> (u8, u64) {
        match self {
            Self::HighCard(cards) => (0, Self::numerize_kickers(&[], cards)),
            Self::OnePair(number, cards) => (1, Self::numerize_kickers(&[number], cards)),
            Self::TwoPairs(high, low, kicker) => {
                (2, Self::numerize_kickers(&[high, low], &[*kicker]))
            }
            Self::Triple(number, cards) => (3, Self::numerize_kickers(&[number], cards)),
            Self::Straight(high) => (4, *high as u64),
            Self::Flush(_, cards) => (
                5,
                Self::numerize_kickers(
                    &[],
                    cards
                        .iter()
                        .map(|n| Card {
                            shape: CardShape::Spade,
                            number: *n,
                        })
                        .collect::<Vec<_>>()
                        .as_slice(),
                ),
            ),
            Self::FullHouse(three, pair) => (6, Self::numerize_kickers(&[three, pair], &[])),
            Self::Quads(number, card) => (7, Self::numerize_kickers(&[number], &[*card])),
            Self::StraightFlush(card) => (8, card.number as u64),
        }
    }

    /// Sort the given card numbers in decreasing order.
    fn sort_decreasing(cards: &mut [Card]) {
        cards.sort_by(|a, b| b.number.cmp(&a.number));
    }

    /// Get `N` cards from the given cards, excluding the specified card numbers.
    /// Returned card numbers are sorted in decreasing order.
    fn get_cards_except<const RET: usize>(cards: &[Card], excludes: &[CardNumber]) -> [Card; RET] {
        let mut result = [Card::default(); RET];
        let mut index = 0;
        for card in cards.iter() {
            if excludes.iter().find(|&&num| num == card.number).is_none() {
                result[index] = *card;
                index += 1;
                if index >= RET {
                    break;
                }
            }
        }
        Self::sort_decreasing(&mut result);
        result
    }

    /// Check if the given 5 card numbers form a straight.
    /// If yes, return the highest card number in the straight.
    /// Note that the input numbers must be sorted in decreasing order.
    fn is_straight(numbers: [CardNumber; 5]) -> Option<CardNumber> {
        const LEN: usize = 5;
        for start in [0, 1] {
            // Check from biggest and
            // second biggest number(A5432 is also straight)
            let mut valid = true;
            for offset in 0..LEN - 1 {
                if !numbers[(start + offset) % LEN]
                    .is_next_in_cycle(&numbers[(start + offset + 1) % LEN])
                {
                    valid = false;
                    break;
                }
            }
            if valid {
                return Some(numbers[(start) % LEN]);
            }
        }
        None
    }

    /// Get the frequencies of each card number in the given cards.
    /// The returned array has length of `NUM_OF_NUMBERS + 2` to
    /// accommodate card numbers from 2 to 14 (Ace).
    fn get_frequencies(cards: &[Card]) -> [usize; NUM_OF_NUMBERS + 2] {
        let mut frequencies = [0; NUM_OF_NUMBERS + 2];
        for card in cards.iter() {
            frequencies[card.number as usize] += 1;
        }
        frequencies
    }

    /// Evaluate the rank of the given 5 cards.
    /// This method does not check if there is any duplicate cards.
    pub fn evaluate(mut cards: [Card; 5]) -> Self {
        Self::sort_decreasing(&mut cards);
        let sorted_numbers = [
            cards[0].number,
            cards[1].number,
            cards[2].number,
            cards[3].number,
            cards[4].number,
        ]; // Sorted numbers in decreasing order

        // Check for flush and straight
        let is_flush: bool = cards.iter().all(|card| card.shape == cards[0].shape);
        let is_straight: Option<CardNumber> = Self::is_straight(sorted_numbers);
        if let Some(highest) = is_straight {
            if is_flush {
                // Straight flush
                return HandRank::StraightFlush(Card {
                    shape: cards[0].shape,
                    number: highest,
                });
            } else {
                // Straight
                return HandRank::Straight(highest);
            }
        } else if is_flush {
            // Flush
            return HandRank::Flush(cards[0].shape, sorted_numbers);
        }

        // Check for pairs, triples, quads
        let frequencies = Self::get_frequencies(&cards);
        let quad = frequencies
            .iter()
            .enumerate()
            .find(|(_, &count)| count == 4)
            .map(|(num, _)| num as i32);
        let triple = frequencies
            .iter()
            .enumerate()
            .find(|(_, &count)| count == 3)
            .map(|(num, _)| num as i32);
        let pairs: Vec<i32> = frequencies
            .iter()
            .enumerate()
            .filter(|(_, &count)| count == 2)
            .map(|(num, _)| num as i32)
            .collect();
        if let Some(quad_num) = quad {
            // Quads
            let quad_num = CardNumber::try_from(quad_num).unwrap();
            let kicker: [Card; 1] = Self::get_cards_except(&cards, &[quad_num]);
            return HandRank::Quads(quad_num, kicker[0]);
        } else if let Some(triple_num) = triple {
            let triple_num = CardNumber::try_from(triple_num).unwrap();
            if pairs.len() == 1 {
                // Full house
                let pair_num = CardNumber::try_from(pairs[0]).unwrap();
                return HandRank::FullHouse(triple_num, pair_num);
            } else if pairs.is_empty() {
                // Triple
                let kickers: [Card; 2] = Self::get_cards_except(&cards, &[triple_num]);
                return HandRank::Triple(triple_num, kickers);
            } else {
                unreachable!("Invalid card frequencies: {:?}", frequencies);
            }
        } else if pairs.len() == 2 {
            // Two pairs
            let high_pair = pairs.iter().max().unwrap();
            let high_pair = CardNumber::try_from(*high_pair).unwrap();
            let low_pair = pairs.iter().min().unwrap();
            let low_pair = CardNumber::try_from(*low_pair).unwrap();
            let kicker: [Card; 1] = Self::get_cards_except(&cards, &[high_pair, low_pair]);
            return HandRank::TwoPairs(high_pair, low_pair, kicker[0]);
        } else if pairs.len() == 1 {
            // One pair
            let pair_num = pairs[0];
            let mut kickers: Vec<Card> = vec![];
            for card in cards.iter() {
                if card.number as i32 != pair_num {
                    kickers.push(*card);
                }
            }
            kickers.sort_by(|a, b| b.number.cmp(&a.number));
            return HandRank::OnePair(
                CardNumber::try_from(pair_num).unwrap(),
                [kickers[0], kickers[1], kickers[2]],
            );
        } else if pairs.is_empty() {
            // High card; Already sorted in decreasing order
            return HandRank::HighCard(cards);
        } else {
            unreachable!("Invalid card frequencies: {:?}", frequencies);
        }
    }

    /// Find the best 5-card hand from the given cards.
    /// If `cards` has less than 5 cards, return an error.
    pub fn find_best5(cards: &[Card]) -> Result<([Card; 5], HandRank), PokercraftLocalError> {
        if cards.len() < 5 {
            return Err(PokercraftLocalError::GeneralError(
                "Not enough cards; Should have at least 5 cards".to_string(),
            ));
        }
        let mut best_card5 = [cards[0], cards[1], cards[2], cards[3], cards[4]];
        let mut best_rank = Self::evaluate(best_card5);
        for this_card5 in FixedSizedCombinationIterator::<Card, 5>::new(cards.iter().copied()) {
            let this_rank = Self::evaluate(this_card5);
            if this_rank > best_rank {
                best_card5 = this_card5;
                best_rank = this_rank;
            }
        }
        Ok((best_card5, best_rank))
    }
}

#[pymethods]
impl HandRank {
    fn __richcmp__(&self, other: &Self, op: pyo3::basic::CompareOp) -> PyResult<bool> {
        match op {
            pyo3::basic::CompareOp::Eq => Ok(self == other),
            pyo3::basic::CompareOp::Ne => Ok(self != other),
            pyo3::basic::CompareOp::Lt => Ok(self < other),
            pyo3::basic::CompareOp::Le => Ok(self <= other),
            pyo3::basic::CompareOp::Gt => Ok(self > other),
            pyo3::basic::CompareOp::Ge => Ok(self >= other),
        }
    }

    /// Python-exported interface of `self.numerize`.
    fn numerize_py(&self) -> PyResult<(u8, u64)> {
        Ok(self.numerize())
    }

    /// Python-exported interface of `Self::find_best5`.
    #[staticmethod]
    pub fn find_best5_py(cards: Vec<Card>) -> PyResult<([Card; 5], HandRank)> {
        match Self::find_best5(&cards) {
            Ok(result) => Ok(result),
            Err(e) => Err(e.into()),
        }
    }
}

impl std::fmt::Display for HandRank {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let repr = match self {
            HandRank::HighCard(cards) => format!(
                "HighCard({})",
                cards
                    .iter()
                    .map(|c| format!("{}", c))
                    .collect::<Vec<_>>()
                    .join(" + ")
            ),
            HandRank::OnePair(number, cards) => format!(
                "OnePair({}, Kickers: {})",
                number,
                cards
                    .iter()
                    .map(|c| format!("{}", c))
                    .collect::<Vec<_>>()
                    .join(" + ")
            ),
            HandRank::TwoPairs(high, low, kicker) => {
                format!("TwoPairs({}, {}, Kicker: {})", high, low, kicker)
            }
            HandRank::Triple(number, cards) => format!(
                "Triple({}, Kickers: {})",
                number,
                cards
                    .iter()
                    .map(|c| format!("{}", c))
                    .collect::<Vec<_>>()
                    .join(" + ")
            ),
            HandRank::Straight(high) => format!("Straight({}-high)", high),
            HandRank::Flush(shape, numbers) => format!(
                "Flush({}, {})",
                numbers
                    .iter()
                    .map(|n| format!("{}", n))
                    .collect::<Vec<_>>()
                    .join(""),
                shape
            ),
            HandRank::FullHouse(three, pair) => format!("FullHouse(3: {}, 2: {})", three, pair),
            HandRank::Quads(number, card) => format!("Quads({}, Kicker: {})", number, card),
            HandRank::StraightFlush(card) => format!("StraightFlush({}-high)", card),
        };
        write!(f, "{}", repr)
    }
}

impl PartialOrd for HandRank {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.numerize().partial_cmp(&other.numerize())
    }
}

impl PartialEq for HandRank {
    fn eq(&self, other: &Self) -> bool {
        self.numerize() == other.numerize()
    }
}

/// Represents a mapping from each card shape to another shape.
/// This does not use `HashMap` because there are only 4 shapes in total.
#[derive(PartialEq, Eq, Copy, Clone, Debug)]
pub struct ShapeMapping {
    mapping: [(CardShape, CardShape); NUM_OF_SHAPES],
}

impl ShapeMapping {
    /// Create a `ShapeMapping` from a mapping array.
    pub fn new(
        mapping: [(CardShape, CardShape); NUM_OF_SHAPES],
    ) -> Result<Self, PokercraftLocalError> {
        if mapping.iter().unique().count() != NUM_OF_SHAPES
            || mapping.iter().map(|(from, _)| *from).unique().count() != NUM_OF_SHAPES
            || mapping.iter().map(|(_, to)| *to).unique().count() != NUM_OF_SHAPES
        {
            return Err(PokercraftLocalError::GeneralError(format!(
                "Invalid shape mapping: {:?}",
                mapping
            )));
        }
        Ok(ShapeMapping { mapping })
    }

    /// Apply this shape mapping to the given card shape.
    pub fn apply_shape(&self, shape: &CardShape) -> CardShape {
        self.mapping
            .iter()
            .find(|(from, _)| from == shape)
            .map(|(_, to)| *to)
            .unwrap() // All shapes are covered, validated in `Self::new`
    }

    /// Apply this shape mapping to the given card.
    pub fn apply_card(&self, card: &Card) -> Card {
        Card {
            shape: self.apply_shape(&card.shape),
            number: card.number,
        }
    }
}

/// Generate a canonical `CardShape` mapping from each card shape to another shape.
fn generate_canonical_shape_mappings() -> impl Iterator<Item = ShapeMapping> {
    let all_shapes = CardShape::all();
    all_shapes.into_iter().permutations(4).map(move |permuted| {
        let mut mapping = [(CardShape::default(), CardShape::default()); NUM_OF_SHAPES];
        for (i, this_shape) in permuted.iter().enumerate() {
            mapping[i] = (all_shapes[i], *this_shape);
        }
        ShapeMapping::new(mapping).unwrap()
    })
}

static CANONICAL_SHAPE_MAPPINGS: once_cell::sync::Lazy<&'static [ShapeMapping]> =
    once_cell::sync::Lazy::new(|| {
        generate_canonical_shape_mappings()
            .collect::<Vec<_>>()
            .leak()
    });

/// Public interface to get the canonical mappings.
pub fn get_canonical_shape_mappings() -> &'static [ShapeMapping] {
    &CANONICAL_SHAPE_MAPPINGS
}

/// Generate all canonical `CardShape` symmetries of the given cards. 24 symmetries in total.
pub fn all_canonical_symmetries<const N: usize>(cards: &[Card; N]) -> [[Card; N]; 1 * 2 * 3 * 4] {
    let mut results = [[Card::default(); N]; 1 * 2 * 3 * 4];
    for (row, mapping) in get_canonical_shape_mappings().iter().enumerate() {
        cards.iter().enumerate().for_each(|(i, card)| {
            results[row][i] = mapping.apply_card(card);
        });
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Check if the given cards always result in the expected
    /// hand rank for all permutations of the cards.
    fn check_for_all_permutations(cards: [Card; 5], expected: HandRank) {
        for shuffled in cards.iter().permutations(5) {
            let cards = [
                *shuffled[0],
                *shuffled[1],
                *shuffled[2],
                *shuffled[3],
                *shuffled[4],
            ];
            let rank = HandRank::evaluate(cards);
            assert_eq!(rank, expected);
        }
    }

    /// Convenience function to create an array of `Card`s from strings.
    /// This method will throw an error if any of the strings is invalid or duplicated.
    fn create_cards_slice<const N: usize>(
        card_strs: [&str; N],
    ) -> Result<[Card; N], PokercraftLocalError> {
        let mut cards = [Card::default(); N];
        for (i, s) in card_strs.iter().enumerate() {
            cards[i] = Card::try_from(*s)?;
        }
        for i in 0..N {
            for j in (i + 1)..N {
                if cards[i] == cards[j] {
                    return Err(PokercraftLocalError::GeneralError(format!(
                        "Duplicated card: {}",
                        cards[i]
                    )));
                }
            }
        }
        Ok(cards)
    }

    #[test]
    /// Test the construction of `HandRank` from various card combinations.
    fn test_rank_construction() -> Result<(), PokercraftLocalError> {
        for cards in [
            create_cards_slice(["As", "Kd", "Jh", "9c", "3s"])?,
            create_cards_slice(["5s", "7d", "4s", "3s", "2s"])?,
        ] {
            println!(
                "Testing cards for high: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let mut sorted_cards = cards.clone();
            HandRank::sort_decreasing(&mut sorted_cards);
            check_for_all_permutations(cards, HandRank::HighCard(sorted_cards));
        }

        for cards in [
            create_cards_slice(["As", "Ad", "Jh", "9c", "3s"])?,
            create_cards_slice(["5s", "5d", "4s", "3s", "2s"])?,
            create_cards_slice(["Qd", "Qh", "7s", "4c", "2d"])?,
        ] {
            println!(
                "Testing cards for one pair: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let mut sorted_kickers = [cards[2], cards[3], cards[4]];
            HandRank::sort_decreasing(&mut sorted_kickers);
            check_for_all_permutations(cards, HandRank::OnePair(cards[0].number, sorted_kickers));
        }

        for cards in [
            create_cards_slice(["As", "Ad", "Jh", "Jc", "3s"])?,
            create_cards_slice(["5s", "5d", "3s", "3c", "4s"])?,
            create_cards_slice(["Qd", "Qh", "7s", "7c", "Ad"])?,
        ] {
            println!(
                "Testing cards for two pairs: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let mut high_pair = cards[0].number;
            let mut low_pair = cards[2].number;
            let kicker = cards[4];
            if low_pair > high_pair {
                std::mem::swap(&mut high_pair, &mut low_pair);
            }
            check_for_all_permutations(cards, HandRank::TwoPairs(high_pair, low_pair, kicker));
        }

        for cards in [
            create_cards_slice(["As", "Ad", "Ac", "9c", "3s"])?,
            create_cards_slice(["5s", "5d", "5h", "3s", "Js"])?,
            create_cards_slice(["Qd", "Qh", "Qs", "7c", "Kd"])?,
        ] {
            println!(
                "Testing cards for triple: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let mut sorted_kickers = [cards[3], cards[4]];
            HandRank::sort_decreasing(&mut sorted_kickers);
            check_for_all_permutations(cards, HandRank::Triple(cards[0].number, sorted_kickers));
        }

        for cards in [
            create_cards_slice(["As", "Kd", "Qh", "Jc", "Ts"])?,
            create_cards_slice(["5s", "4d", "3h", "2c", "As"])?,
            create_cards_slice(["9d", "8h", "7s", "6c", "5d"])?,
        ] {
            println!(
                "Testing cards for straight: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            check_for_all_permutations(cards, HandRank::Straight(cards[0].number));
        }

        for cards in [
            create_cards_slice(["As", "Ks", "Qs", "Js", "9s"])?,
            create_cards_slice(["5d", "4d", "3d", "2d", "Jd"])?,
            create_cards_slice(["9c", "3c", "2c", "6c", "Tc"])?,
        ] {
            println!(
                "Testing cards for flush: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let mut sorted_numbers = [
                cards[0].number,
                cards[1].number,
                cards[2].number,
                cards[3].number,
                cards[4].number,
            ];
            sorted_numbers.sort();
            sorted_numbers.reverse();
            check_for_all_permutations(cards, HandRank::Flush(cards[0].shape, sorted_numbers));
        }

        for cards in [
            create_cards_slice(["As", "Ad", "Ac", "Ks", "Kd"])?,
            create_cards_slice(["5s", "5d", "5h", "3c", "3s"])?,
            create_cards_slice(["Qd", "Qh", "Qs", "Kc", "Kd"])?,
        ] {
            println!(
                "Testing cards for full house: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let three = cards[0].number;
            let pair = cards[3].number;
            check_for_all_permutations(cards, HandRank::FullHouse(three, pair));
        }

        for cards in [
            create_cards_slice(["As", "Ad", "Ac", "Ah", "Kd"])?,
            create_cards_slice(["5s", "5d", "5h", "5c", "Js"])?,
            create_cards_slice(["Qd", "Qh", "Qs", "Qc", "2d"])?,
        ] {
            println!(
                "Testing cards for quads: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let four = cards[0].number;
            let kicker = cards[4];
            check_for_all_permutations(cards, HandRank::Quads(four, kicker));
        }

        for cards in [
            create_cards_slice(["As", "Ks", "Qs", "Js", "Ts"])?,
            create_cards_slice(["5d", "4d", "3d", "2d", "Ad"])?,
            create_cards_slice(["9c", "8c", "7c", "6c", "5c"])?,
        ] {
            println!(
                "Testing cards for straight flush: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let highest = cards[0];
            check_for_all_permutations(cards, HandRank::StraightFlush(highest));
        }

        Ok(())
    }

    #[test]
    fn test_rank_order() -> Result<(), PokercraftLocalError> {
        let ranks = [
            // High cards
            HandRank::HighCard(create_cards_slice(["7s", "6d", "4h", "3c", "2s"])?),
            HandRank::HighCard(create_cards_slice(["8s", "6c", "4h", "3c", "2s"])?),
            HandRank::HighCard(create_cards_slice(["As", "Kd", "4c", "3c", "2d"])?),
            HandRank::HighCard(create_cards_slice(["As", "Kd", "Jh", "5h", "4s"])?),
            HandRank::HighCard(create_cards_slice(["As", "Kd", "Jh", "9c", "2s"])?),
            HandRank::HighCard(create_cards_slice(["As", "Kd", "Jh", "9c", "3s"])?),
            // One pair
            HandRank::OnePair(CardNumber::Two, create_cards_slice(["Ks", "Qd", "3d"])?),
            HandRank::OnePair(CardNumber::Two, create_cards_slice(["Ks", "Qd", "Jh"])?),
            HandRank::OnePair(CardNumber::Two, create_cards_slice(["As", "Kd", "Jh"])?),
            HandRank::OnePair(CardNumber::Ten, create_cards_slice(["Ks", "Qd", "Jh"])?),
            HandRank::OnePair(CardNumber::Ace, create_cards_slice(["Ks", "Qd", "Jh"])?),
            // Two pairs
            HandRank::TwoPairs(CardNumber::King, CardNumber::Jack, "Qd".try_into()?),
            HandRank::TwoPairs(CardNumber::Ace, CardNumber::Jack, "Qd".try_into()?),
            HandRank::TwoPairs(CardNumber::Ace, CardNumber::King, "6d".try_into()?),
            HandRank::TwoPairs(CardNumber::Ace, CardNumber::King, "Qd".try_into()?),
            // Triple
            HandRank::Triple(CardNumber::Three, create_cards_slice(["Jd", "Th"])?),
            HandRank::Triple(CardNumber::Four, create_cards_slice(["As", "Qh"])?),
            HandRank::Triple(CardNumber::Ace, create_cards_slice(["Jd", "Th"])?),
            HandRank::Triple(CardNumber::Ace, create_cards_slice(["Kd", "2h"])?),
            HandRank::Triple(CardNumber::Ace, create_cards_slice(["Kd", "Jh"])?),
            // Straight
            HandRank::Straight(CardNumber::Five),
            HandRank::Straight(CardNumber::Nine),
            HandRank::Straight(CardNumber::Ace),
            // Flush
            HandRank::Flush(
                CardShape::Club,
                [
                    CardNumber::King,
                    CardNumber::Jack,
                    CardNumber::Ten,
                    CardNumber::Nine,
                    CardNumber::Two,
                ],
            ),
            HandRank::Flush(
                CardShape::Spade,
                [
                    CardNumber::Ace,
                    CardNumber::King,
                    CardNumber::Eight,
                    CardNumber::Seven,
                    CardNumber::Six,
                ],
            ),
            HandRank::Flush(
                CardShape::Spade,
                [
                    CardNumber::Ace,
                    CardNumber::King,
                    CardNumber::Jack,
                    CardNumber::Nine,
                    CardNumber::Three,
                ],
            ),
            HandRank::Flush(
                CardShape::Spade,
                [
                    CardNumber::Ace,
                    CardNumber::King,
                    CardNumber::Jack,
                    CardNumber::Nine,
                    CardNumber::Eight,
                ],
            ),
            // Full house
            HandRank::FullHouse(CardNumber::King, CardNumber::Two),
            HandRank::FullHouse(CardNumber::King, CardNumber::Ace),
            HandRank::FullHouse(CardNumber::Ace, CardNumber::King),
            // Quads
            HandRank::Quads(CardNumber::King, "As".try_into()?),
            HandRank::Quads(CardNumber::Ace, "Jd".try_into()?),
            HandRank::Quads(CardNumber::Ace, "Qd".try_into()?),
            // Straight flush
            HandRank::StraightFlush("5d".try_into()?),
            HandRank::StraightFlush("9c".try_into()?),
            HandRank::StraightFlush("As".try_into()?),
        ];

        // Brute force comparison
        for i in 0..ranks.len() {
            for j in (i + 1)..ranks.len() {
                assert!(ranks[i] < ranks[j]);
            }
        }
        Ok(())
    }

    #[test]
    fn test_rank_evaluation() -> Result<(), PokercraftLocalError> {
        let hand_and_boards: Vec<(Hand, [Card; 5], HandRank)> = vec![
            (
                ("Ah".try_into()?, "8h".try_into()?),
                create_cards_slice(["3d", "4d", "5d", "8d", "9d"])?,
                HandRank::Flush(
                    CardShape::Diamond,
                    [
                        CardNumber::Nine,
                        CardNumber::Eight,
                        CardNumber::Five,
                        CardNumber::Four,
                        CardNumber::Three,
                    ],
                ),
            ),
            (
                ("3s".try_into()?, "As".try_into()?),
                create_cards_slice(["3d", "4d", "5d", "8d", "9d"])?,
                HandRank::Flush(
                    CardShape::Diamond,
                    [
                        CardNumber::Nine,
                        CardNumber::Eight,
                        CardNumber::Five,
                        CardNumber::Four,
                        CardNumber::Three,
                    ],
                ),
            ),
            (
                ("Ah".try_into()?, "8h".try_into()?),
                create_cards_slice(["6h", "6d", "5s", "5c", "Kd"])?,
                HandRank::TwoPairs(CardNumber::Six, CardNumber::Five, "Ah".try_into()?),
            ),
            (
                ("3s".try_into()?, "As".try_into()?),
                create_cards_slice(["6h", "6d", "5s", "5c", "Kd"])?,
                HandRank::TwoPairs(CardNumber::Six, CardNumber::Five, "As".try_into()?),
            ),
        ];
        for (hand, board, expected_rank) in hand_and_boards.into_iter() {
            let all_cards = vec![
                board[0], board[1], board[2], board[3], board[4], hand.0, hand.1,
            ];
            let (_best_hand, got_best_rank) = HandRank::find_best5(&all_cards)?;
            assert_eq!(
                got_best_rank,
                expected_rank,
                "Rank mismatch for hand {}{} and board {} {} {} {} {} (Expected: {:?} ({:?}), Got: {:?} ({:?}))",
                hand.0,
                hand.1,
                board[0],
                board[1],
                board[2],
                board[3],
                board[4],
                expected_rank,
                expected_rank.numerize(),
                got_best_rank,
                got_best_rank.numerize(),
            );
        }

        Ok(())
    }

    #[test]
    fn test_canonical_shape_mappings() -> Result<(), PokercraftLocalError> {
        let mappings = get_canonical_shape_mappings();
        assert_eq!(mappings.len(), 24); // 4! = 24

        let cards = ["As".try_into()?, "Kd".try_into()?];
        let symmetries = all_canonical_symmetries(&cards);
        for shape1 in CardShape::all() {
            for shape2 in CardShape::all() {
                let this_card1 = Card {
                    shape: shape1,
                    number: CardNumber::Ace,
                };
                let this_card2 = Card {
                    shape: shape2,
                    number: CardNumber::King,
                };
                let found = symmetries.iter().find(|&&x| x == [this_card1, this_card2]);
                if shape1 == shape2 {
                    assert!(
                        found.is_none(),
                        "Unexpected symmetry for {}{}",
                        this_card1,
                        this_card2
                    )
                } else {
                    assert!(
                        found.is_some(),
                        "Missing symmetry for {}{}",
                        this_card1,
                        this_card2
                    )
                }
            }
        }
        Ok(())
    }
}
