//! Pokercraft Core Library
//!
//! This crate provides core poker analysis functionality that can be compiled
//! for multiple targets:
//! - Native Rust library
//! - Python extension (via PyO3) with `python` feature
//! - WebAssembly module (via wasm-bindgen) with `wasm` feature

pub mod bankroll;
pub mod card;
pub mod equity;
pub mod errors;
pub mod utils;

// Re-export commonly used types
pub use card::{Card, CardNumber, CardShape, Hand, HandRank};
pub use errors::PokercraftLocalError;
