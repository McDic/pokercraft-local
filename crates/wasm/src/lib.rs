//! WebAssembly bindings for pokercraft-core.
//!
//! This crate provides WASM bindings for the core poker analysis library.
//! Build with: `wasm-pack build --target web`

use wasm_bindgen::prelude::*;

// Re-export types from pokercraft-core with WASM bindings
pub use pokercraft_core::bankroll::BankruptcyMetric;
pub use pokercraft_core::card::{Card, CardNumber, CardShape};
pub use pokercraft_core::equity::{EquityResult, LuckCalculator};

// Re-export the simulate function
pub use pokercraft_core::bankroll::simulate_wasm as simulate;

/// Initialize the WASM module (called automatically).
#[wasm_bindgen(start)]
pub fn init() {
    // Set up better panic messages in debug mode
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Get the library version.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
