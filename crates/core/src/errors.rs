//! Definition of custom error types.

/// Represents all errors that can occur in Pokercraft Local's rust modules.
#[derive(thiserror::Error, Debug)]
pub enum PokercraftLocalError {
    #[error("Error: {0}")]
    GeneralError(String),
    #[error("IO Error: {0}")]
    IoError(std::io::Error),
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
