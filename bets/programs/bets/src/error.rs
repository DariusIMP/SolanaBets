use anchor_lang::prelude::*;


#[error_code]
pub enum ErrorCode {
    #[msg("Betting window is closed.")]
    BettingClosed,
    #[msg("Invalid prediction. Must > 0.")]
    InvalidPrediction,
    #[msg("Betting window is not closed yet.")]
    BettingNotClosed,
    #[msg("Betting window is already resolved.")]
    AlreadyResolved,
    #[msg("No bets to resolve.")]
    NoBets,
    #[msg("Betting window is not resolved yet.")]
    NotResolved,
    #[msg("There is no winning bet.")]
    NoBet,
    #[msg("You lost.")]
    YouLost,
}
