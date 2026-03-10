//! Definition of custom error types.

/// Represents all errors that can occur in ggsession's Rust modules.
#[derive(thiserror::Error, Debug)]
pub enum GgsessionError {
    #[error("Error: {0}")]
    GeneralError(String),
    #[error("IO Error: {0}")]
    IoError(std::io::Error),
}

impl From<std::io::Error> for GgsessionError {
    fn from(err: std::io::Error) -> Self {
        GgsessionError::IoError(err)
    }
}

// WASM error conversion
#[cfg(feature = "wasm")]
impl From<GgsessionError> for wasm_bindgen::JsValue {
    fn from(err: GgsessionError) -> Self {
        js_sys::Error::new(&err.to_string()).into()
    }
}
