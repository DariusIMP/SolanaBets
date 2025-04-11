use anchor_lang::prelude::*;
use instructions::*;

declare_id!("FUAgYVx38NXB9nEnYycCqMsvXtVaZ6bqFzipFsCY3VZZ");

pub mod instructions;
pub mod state;
pub mod error;

#[program]
pub mod bets {
    use super::*;

    /// Places a bet on "rain" (1) or "no rain" (0).
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        window_id: u64,
        prediction: i8, // 1 for rain, 0 for no rain
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

