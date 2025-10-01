use pyo3::prelude::*;

pub mod bankroll;
pub mod card;
pub mod equity;
pub mod errors;
pub mod utils;

/// A Python module implemented in Rust.
#[pymodule]
#[pyo3(name = "rust")]
fn main_module(m_main: &Bound<'_, PyModule>) -> PyResult<()> {
    new_submodule(m_main, "bankroll", |m_bankroll| {
        m_bankroll.add_function(wrap_pyfunction!(bankroll::simulate, m_bankroll)?)?;
        m_bankroll.add_class::<bankroll::BankruptcyMetric>()?;
        Ok(())
    })?;
    new_submodule(m_main, "card", |m_card| {
        m_card.add_class::<card::Card>()?;
        m_card.add_class::<card::CardNumber>()?;
        m_card.add_class::<card::CardShape>()?;
        m_card.add_class::<card::HandRank>()?;
        Ok(())
    })?;
    new_submodule(m_main, "equity", |m_equity| {
        m_equity.add_class::<equity::EquityResult>()?;
        m_equity.add_class::<equity::LuckCalculator>()?;
        m_equity.add_class::<equity::HUPreflopEquityCache>()?;
        Ok(())
    })?;
    Ok(())
}

/// Helper function to create and add a new submodule to the parent module.
fn new_submodule<'a, F>(
    parent: &Bound<'a, PyModule>,
    name: &'static str,
    mut performer: F,
) -> PyResult<()>
where
    F: FnMut(&Bound<'a, PyModule>) -> PyResult<()>,
{
    let m = PyModule::new(parent.py(), name)?;
    parent.add_submodule(&m)?;
    performer(&m)?;
    Ok(())
}
