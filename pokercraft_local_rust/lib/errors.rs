//! Definition of custom error types.

use pyo3::exceptions as py_exceptions;

/// Represents all errors that can occur in Pokercraft Local's rust modules.
#[derive(thiserror::Error, Debug)]
pub enum PokercraftLocalError {
    #[error("Error: {0}")]
    GeneralError(String),
    #[error("IO Error: {0}")]
    IoError(std::io::Error),
}

impl From<PokercraftLocalError> for pyo3::PyErr {
    fn from(err: PokercraftLocalError) -> Self {
        match err {
            PokercraftLocalError::GeneralError(msg) => py_exceptions::PyRuntimeError::new_err(msg),
            PokercraftLocalError::IoError(err) => {
                py_exceptions::PyIOError::new_err(err.to_string())
            }
        }
    }
}

impl From<std::io::Error> for PokercraftLocalError {
    fn from(err: std::io::Error) -> Self {
        PokercraftLocalError::IoError(err)
    }
}
