use anchor_lang::prelude::*;
use instructions::*;

declare_id!("9ZXoWhyzVVbLsR8REqgH763W8PWZ2r1RFvdVgDjFMWJF");

pub mod instructions;
pub mod state;
pub mod error;

#[program]
pub mod bets {
    use super::*;

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        window_id: u64,
        prediction: i8,  // temperature
        amount: u64,   // SOL amount in lamports
    ) -> Result<()> {
        instructions::place_bet(ctx, window_id, prediction, amount)
    }

    /// Expire the betting window.
    pub fn resolve_bet(ctx: Context<ResolveBet>, window_id: u64, result: i8) -> Result<()> {
        instructions::resolve_bet(ctx, window_id, result)
    }

    /// User claim the payout
    pub fn claim_payout(
        ctx: Context<ClaimPayout>,
        window_id: u64,
    ) -> Result<()> {
        instructions::claim_payout(ctx, window_id)
    }

    /// Resets the betting window to clear bets and prepare for a new round.
    pub fn reset_bet(
        ctx: Context<ResetBet>,
        window_id: u64,
    ) -> Result<()> {
        instructions::reset_bet(ctx, window_id)
    }
}

