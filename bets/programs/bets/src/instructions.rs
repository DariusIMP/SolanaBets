use anchor_lang::prelude::*;
use anchor_lang::system_program;


use crate::state::{Bet, BettingWindow};
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 8 + 8 + 4 + 1 + 8 + 8 + 8 + 1000, // Adjust space as needed
        seeds = [b"betting_window", clock.slot.to_le_bytes().as_ref()],
        bump
    )]
    pub betting_window: Account<'info, BettingWindow>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct WeatherDegrees<'info> {
    #[account(
        mut,
        seeds = [b"betting_window", betting_window.start_slot.to_le_bytes().as_ref()],
        bump
    )]
    pub betting_window: Account<'info, BettingWindow>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct ResolveBet<'info> {
    #[account(
        mut,
        seeds = [b"betting_window", betting_window.start_slot.to_le_bytes().as_ref()],
        bump,
        constraint = betting_window.end_slot <= clock.slot @ ErrorCode::BettingNotClosed,
        constraint = !betting_window.resolved @ ErrorCode::AlreadyResolved
    )]
    pub betting_window: Account<'info, BettingWindow>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}


pub fn place_bet(ctx: Context<PlaceBet>, prediction: i8, amount: u64) -> Result<()> {
    let betting_window = &mut ctx.accounts.betting_window;
    let user = &ctx.accounts.user;
    let clock = &ctx.accounts.clock;

    // Validate prediction (1 for rain, 0 for no rain)
    if prediction != 0 && prediction != 1 {
        return Err(ErrorCode::InvalidPrediction.into());
    }

    // Check if betting window is still open (~3 hours = ~25,000 slots)
    let current_slot = clock.slot;
    if betting_window.start_slot == 0 {
        betting_window.start_slot = current_slot;
        betting_window.end_slot = current_slot + 25_000; // ~3 hours
    }
    if current_slot > betting_window.end_slot {
        return Err(ErrorCode::BettingClosed.into());
    }

    // Transfer SOL to betting window
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: user.to_account_info(),
            to: betting_window.to_account_info(),
        },
    );
    system_program::transfer(cpi_context, amount)?;

    // Record the bet
    let bet = Bet {
        user: user.key(),
        amount,
        prediction,
    };
    betting_window.bets.push(bet);

    // Update pools
    betting_window.total_pool += amount;
    if prediction == 1 {
        betting_window.rain_pool += amount;
    } else {
        betting_window.no_rain_pool += amount;
    }

    Ok(())
}

pub fn weather_degrees(ctx: Context<WeatherDegrees>) -> Result<()> {
    let betting_window = &mut ctx.accounts.betting_window;
    let clock = &ctx.accounts.clock;

    // Ensure betting window is closed
    if clock.slot < betting_window.end_slot {
        return Err(ErrorCode::BettingNotClosed.into());
    }

    // Simulate weather outcome (in production, use an oracle)
    // For demo: use slot number to generate pseudo-random 0 or 1
    let pseudo_random = (clock.slot % 2) as i8; // 0 (no rain) or 1 (rain)
    betting_window.weather_result = pseudo_random;

    Ok(())
}

pub fn resolve_bet(ctx: Context<ResolveBet>) -> Result<()> {
    let betting_window = &mut ctx.accounts.betting_window;

    if betting_window.bets.is_empty() {
        return Err(ErrorCode::NoBets.into());
    }

    // Determine winning pool and total winning amount
    let (winning_pool, winning_amount) = if betting_window.weather_result == 1 {
        (betting_window.rain_pool, betting_window.no_rain_pool)
    } else {
        (betting_window.no_rain_pool, betting_window.rain_pool)
    };

    // Avoid division by zero
    if winning_pool == 0 {
        betting_window.resolved = true;
        return Ok(()); // No winners, resolve without payouts
    }

    // Distribute winnings
    for bet in betting_window.bets.iter() {
        if bet.prediction == betting_window.weather_result {
            // Calculate payout: (bet amount / winning pool) * total pool
            let payout = (bet.amount as u128 * betting_window.total_pool as u128 / winning_pool as u128) as u64;
            **betting_window.to_account_info().try_borrow_mut_lamports()? -= payout;
            **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += payout;
        }
    }

    betting_window.resolved = true;
    Ok(())
}