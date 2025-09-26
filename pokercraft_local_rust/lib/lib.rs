use pyo3::prelude::*;

pub mod bankroll;
pub mod card;
pub mod equity;
pub mod errors;

/// A Python module implemented in Rust.
#[pymodule]
#[pyo3(name = "rust")]
fn main_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_submodule(&bankroll_submodule(m)?)?;
    m.add_submodule(&card_submodule(m)?)?;
    m.add_submodule(&equity_submodule(m)?)?;
    Ok(())
}

/// Add the `card` submodule to the parent module.
fn card_submodule<'a>(parent: &Bound<'a, PyModule>) -> PyResult<Bound<'a, PyModule>> {
    let m = PyModule::new(parent.py(), "card")?;
    m.add_class::<card::Card>()?;
    m.add_class::<card::CardNumber>()?;
    m.add_class::<card::CardShape>()?;
    m.add_class::<card::HandRank>()?;
    Ok(m)
}

/// Add the `equity` submodule to the parent module.
fn equity_submodule<'a>(parent: &Bound<'a, PyModule>) -> PyResult<Bound<'a, PyModule>> {
    let m = PyModule::new(parent.py(), "equity")?;
    m.add_class::<equity::EquityResult>()?;
    m.add_class::<equity::LuckCalculator>()?;
    m.add_class::<equity::HUPreflopEquityCache>()?;
    Ok(m)
}

/// Add the `bankroll` submodule to the parent module.
fn bankroll_submodule<'a>(parent: &Bound<'a, PyModule>) -> PyResult<Bound<'a, PyModule>> {
    let m = PyModule::new(parent.py(), "bankroll")?;
    m.add_function(wrap_pyfunction!(bankroll::simulate, &m)?)?;
    m.add_class::<bankroll::BankruptcyMetric>()?;
    Ok(m)
}
