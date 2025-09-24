//! Definition of custom error types.

use pyo3::exceptions as py_exceptions;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PokercraftLocalError {
    #[error("Error: {0}")]
    GeneralError(String),
}

impl From<PokercraftLocalError> for pyo3::PyErr {
    fn from(err: PokercraftLocalError) -> Self {
        match err {
            PokercraftLocalError::GeneralError(msg) => py_exceptions::PyRuntimeError::new_err(msg),
        }
    }
}
