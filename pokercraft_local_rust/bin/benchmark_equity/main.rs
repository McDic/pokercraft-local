use std::time::Instant;

use pokercraft_local_rust::{
    card::{Card, Hand},
    equity::EquityResult,
    errors::PokercraftLocalError,
};

fn main() -> Result<(), PokercraftLocalError> {
    let hand1: Hand = (Card::try_from("Ah")?, Card::try_from("Ad")?);
    let hand2: Hand = (Card::try_from("6s")?, Card::try_from("7s")?);

    let start = Instant::now();
    let result_parallel = EquityResult::new(vec![hand1, hand2], vec![], true)?;
    let duration_parallel = start.elapsed();
    println!(
        "Parallel calculation took: {:?}, result: {:?}",
        duration_parallel, result_parallel
    );

    let start = Instant::now();
    let result_sequential = EquityResult::new(vec![hand1, hand2], vec![], false)?;
    let duration_sequential = start.elapsed();
    println!(
        "Sequential calculation took: {:?}, result: {:?}",
        duration_sequential, result_sequential
    );

    Ok(())
}
