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
        prediction: i8, // 1 for rain, 0 for no rain
        amount: u64,   // SOL amount in lamports
    ) -> Result<()> {
        instructions::place_bet(ctx, prediction, amount)
    }

    /// Generates simulated weather data (random rain/no rain).
    pub fn weather_degrees(ctx: Context<WeatherDegrees>) -> Result<()> {
        instructions::weather_degrees(ctx)
    }

    /// Resolves the betting window and distributes payouts.
    pub fn resolve_bet(ctx: Context<ResolveBet>) -> Result<()> {
        instructions::resolve_bet(ctx)
    }
}

