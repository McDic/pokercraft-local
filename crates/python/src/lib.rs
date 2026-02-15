//! Python bindings for pokercraft-core.
//!
//! This crate provides a thin wrapper that re-exports the core library's
//! Python module. The actual implementation is in pokercraft-core.

use pyo3::prelude::*;

/// Re-export the main Python module from pokercraft-core.
/// This module is named "rust" to match the Python import path.
#[pymodule]
#[pyo3(name = "rust")]
fn main_module(m_main: &Bound<'_, PyModule>) -> PyResult<()> {
    new_submodule(m_main, "bankroll", |m_bankroll| {
        m_bankroll.add_function(wrap_pyfunction!(
            pokercraft_core::bankroll::simulate,
            m_bankroll
        )?)?;
        m_bankroll.add_class::<pokercraft_core::bankroll::BankruptcyMetric>()?;
        Ok(())
    })?;
    new_submodule(m_main, "card", |m_card| {
        m_card.add_class::<pokercraft_core::card::Card>()?;
        m_card.add_class::<pokercraft_core::card::CardNumber>()?;
        m_card.add_class::<pokercraft_core::card::CardShape>()?;
        m_card.add_class::<pokercraft_core::card::HandRank>()?;
        Ok(())
    })?;
    new_submodule(m_main, "equity", |m_equity| {
        m_equity.add_class::<pokercraft_core::equity::EquityResult>()?;
        m_equity.add_class::<pokercraft_core::equity::LuckCalculator>()?;
        m_equity.add_class::<pokercraft_core::equity::HUPreflopEquityCache>()?;
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
