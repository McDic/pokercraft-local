use pyo3::prelude::*;

mod bankroll;
mod card;
mod errors;

/// A Python module implemented in Rust.
#[pymodule]
#[pyo3(name = "_rust")]
fn main_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_submodule(&bankroll_submodule(m)?)?;
    Ok(())
}

/// Add the `bankroll` submodule to the parent module.
fn bankroll_submodule<'a>(parent: &Bound<'a, PyModule>) -> PyResult<Bound<'a, PyModule>> {
    let m = PyModule::new(parent.py(), "bankroll")?;
    m.add_function(wrap_pyfunction!(bankroll::simulate, &m)?)?;
    m.add_class::<bankroll::BankruptcyMetric>()?;
    Ok(m)
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_empty_func() {}
}
