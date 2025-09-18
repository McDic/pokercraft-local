use thiserror::Error;

#[derive(Error, Debug)]
pub enum PokercraftLocalError {
    #[error("Error: {0}")]
    GeneralError(String),
}
