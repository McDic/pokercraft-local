//! Definition of custom error types.

#[cfg(feature = "python")]
use pyo3::exceptions as py_exceptions;

/// Represents all errors that can occur in Pokercraft Local's rust modules.
#[derive(thiserror::Error, Debug)]
pub enum PokercraftLocalError {
    #[error("Error: {0}")]
    GeneralError(String),
    #[error("IO Error: {0}")]
    IoError(std::io::Error),
}

#[cfg(feature = "python")]
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

// WASM error conversion
#[cfg(feature = "wasm")]
impl From<PokercraftLocalError> for wasm_bindgen::JsValue {
    fn from(err: PokercraftLocalError) -> Self {
        js_sys::Error::new(&err.to_string()).into()
    }
}
