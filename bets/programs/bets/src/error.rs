use anchor_lang::prelude::*;


#[error_code]
pub enum ErrorCode {
    #[msg("Betting window is closed.")]
    BettingClosed,
    #[msg("Invalid prediction. Use 1 for rain or 0 for no rain.")]
    InvalidPrediction,
    #[msg("Betting window is not closed yet.")]
    BettingNotClosed,
    #[msg("Betting window is already resolved.")]
    AlreadyResolved,
    #[msg("No bets to resolve.")]
    NoBets,
}
