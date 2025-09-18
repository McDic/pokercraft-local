use pyo3::prelude::*;

pub const NUM_OF_SHAPES: usize = 4;
pub const NUM_OF_NUMBERS: usize = 13;

/// Card shapes (suits) in a standard deck of playing cards.
#[pyclass(eq)]
#[derive(PartialEq, Eq, Clone, Copy)]
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

/// Card numbers (ranks) in a standard deck of playing cards.
#[pyclass(eq)]
#[derive(PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]
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

    /// Check if this card number is the next of the given previous card number,
    /// in straight order. (A234567...QKA)
    pub fn is_next_in_cycle(&self, previous: &CardNumber) -> bool {
        if previous == &CardNumber::Ace {
            return self == &CardNumber::Two;
        } else {
            return (*self as u8) == (*previous as u8) + 1;
        }
    }
}

/// A playing card in a standard deck of 52 cards.
#[pyclass(eq)]
#[derive(PartialEq, Eq, Copy, Clone)]
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
