use pyo3::prelude::*;

mod bankroll;
mod card;
mod errors;

/// A Python module implemented in Rust.
#[pymodule]
#[pyo3(name = "_rust")]
fn main_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_submodule(&bankroll_submodule(m)?)?;
    m.add_submodule(&card_submodule(m)?)?;
    Ok(())
}

/// Add the `card` submodule to the parent module.
fn card_submodule<'a>(parent: &Bound<'a, PyModule>) -> PyResult<Bound<'a, PyModule>> {
    let m = PyModule::new(parent.py(), "card")?;
    m.add_class::<card::Card>()?;
    m.add_class::<card::CardNumber>()?;
    m.add_class::<card::CardShape>()?;
    m.add_class::<card::HandRank>()?;
    m.add_class::<card::EquityResult>()?;
    Ok(m)
}

/// Add the `bankroll` submodule to the parent module.
fn bankroll_submodule<'a>(parent: &Bound<'a, PyModule>) -> PyResult<Bound<'a, PyModule>> {
    let m = PyModule::new(parent.py(), "bankroll")?;
    m.add_function(wrap_pyfunction!(bankroll::simulate, &m)?)?;
    m.add_class::<bankroll::BankruptcyMetric>()?;
    Ok(m)
}
