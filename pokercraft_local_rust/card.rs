use pyo3::prelude::*;

use crate::errors::PokercraftLocalError;

pub const NUM_OF_SHAPES: usize = 4;
pub const NUM_OF_NUMBERS: usize = 13;

/// Card shapes (suits) in a standard deck of playing cards.
#[pyclass(eq)]
#[derive(PartialEq, Eq, Clone, Copy, Debug)]
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
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Copy, Debug)]
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
#[derive(PartialEq, Eq, Copy, Clone, Debug, Default)]
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
#[derive(PartialEq, Eq, Copy, Clone, Debug)]
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
    fn get_cards_except<const Ret: usize>(cards: &[Card], excludes: &[CardNumber]) -> [Card; Ret] {
        let mut result = [Card::default(); Ret];
        let mut index = 0;
        for card in cards.iter() {
            if excludes.iter().find(|&&num| num == card.number).is_none() {
                result[index] = *card;
                index += 1;
                if index >= Ret {
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
                return Some(numbers[(start + 4) % LEN]);
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
    pub fn new(mut cards: [Card; 5]) -> Self {
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
}

impl PartialOrd for HandRank {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.numerize().partial_cmp(&other.numerize())
    }
}

impl Ord for HandRank {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.numerize().cmp(&other.numerize())
    }
}

#[cfg(test)]
mod tests {
    use itertools::Itertools;

    use super::*;

    /// Check if the given cards always result in the expected hand rank.
    fn check_for_all_permutations(cards: [Card; 5], expected: HandRank) {
        for shuffled in cards.iter().permutations(5) {
            let cards = [
                *shuffled[0],
                *shuffled[1],
                *shuffled[2],
                *shuffled[3],
                *shuffled[4],
            ];
            let rank = HandRank::new(cards);
            assert_eq!(rank, expected);
        }
    }

    #[test]
    fn test_rank_high_card() -> Result<(), PokercraftLocalError> {
        for cards in [
            [
                "As".try_into()?,
                "Kh".try_into()?,
                "9d".try_into()?,
                "5c".try_into()?,
                "3s".try_into()?,
            ],
            [
                "3s".try_into()?,
                "5s".try_into()?,
                "4s".try_into()?,
                "2s".try_into()?,
                "7d".try_into()?,
            ],
        ] {
            println!(
                "Testing cards: {} {} {} {} {}",
                cards[0], cards[1], cards[2], cards[3], cards[4]
            );
            let mut sorted_cards = cards.clone();
            HandRank::sort_decreasing(&mut sorted_cards);
            check_for_all_permutations(cards, HandRank::HighCard(sorted_cards));
        }
        Ok(())
    }
}
