use std::{collections::HashSet, fs::OpenOptions, io::Write, path::PathBuf, sync::mpsc, thread};

use clap::Parser;
use itertools::Itertools;
use rayon::prelude::*;

use pokercraft_local_rust::{
    self as plr,
    card::{Card, Hand},
    equity::EquityResult,
};

#[derive(Parser, Debug)]
struct Args {
    #[arg(long)]
    file: PathBuf,
}

/// Generate all combinations of head-up hands (2 cards each) for two players,
/// excluding canonical/symmetric duplicates.
fn get_all_headsup_hands() -> Vec<(Hand, Hand)> {
    let all_cards = Card::all();
    let mut result: HashSet<(Hand, Hand)> = all_cards
        .iter()
        .permutations(4)
        .map(|cards| ((*cards[0], *cards[1]), (*cards[2], *cards[3])))
        .collect();
    for cards4 in all_cards.iter().permutations(4) {
        let hand1 = (*cards4[0], *cards4[1]);
        let hand2 = (*cards4[2], *cards4[3]);
        if !result.contains(&(hand1, hand2)) {
            // Already removed
            continue;
        }
        let possible_keys = plr::equity::HUPreflopEquityCache::possible_keys_l3(hand1, hand2);
        for ((cano_hand1, cano_hand2), _is_swapped) in possible_keys {
            result.remove(&(cano_hand1, cano_hand2));
        }
        result.insert((hand1, hand2));
    }
    result.into_iter().collect::<Vec<_>>()
}

/// Get (P1 wins, P2 wins, ties) of two players.
fn get_winloses_hu(equity_result: &EquityResult) -> (u64, u64, u64) {
    let (wins_0, loses_0) = equity_result.get_winlosses(0).unwrap();
    let (wins_1, loses_1) = equity_result.get_winlosses(1).unwrap();
    let ties = wins_0[1];
    assert!(ties == wins_1[1]);
    assert!(wins_0[0] == loses_1);
    assert!(wins_1[0] == loses_0);
    (wins_0[0], wins_1[0], ties)
}

fn main() {
    let args = Args::parse();
    let (tx, rx) = mpsc::channel::<((Hand, Hand), EquityResult)>();

    let writer_handle = thread::spawn(move || {
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(false)
            .open(&args.file)
            .unwrap();
        for (i, ((hand1, hand2), equity_result)) in rx.iter().enumerate() {
            let (p1_wins, p2_wins, ties) = get_winloses_hu(&equity_result);
            writeln!(
                file,
                "{}{} vs {}{} = {} {} {}",
                hand1.0, hand1.1, hand2.0, hand2.1, p1_wins, p2_wins, ties
            )
            .unwrap();
            if (i + 1) % 100 == 0 {
                println!("Processed {} hands...", i + 1);
                file.flush().unwrap();
            }
        }
    });

    let all_headsup_hands = get_all_headsup_hands();
    println!(
        "Total unique head-up hand combinations: {}",
        all_headsup_hands.len()
    );

    let _calc_handle = all_headsup_hands.par_iter().for_each(|(hand1, hand2)| {
        let equity_result = EquityResult::new(vec![*hand1, *hand2], vec![], true).unwrap();
        tx.send(((*hand1, *hand2), equity_result)).unwrap();
    });
    drop(tx);
    writer_handle.join().unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_headsup_hands_len() {
        let all_headsup_hands = get_all_headsup_hands();
        assert_eq!(all_headsup_hands.len(), 47008);
    }
}
