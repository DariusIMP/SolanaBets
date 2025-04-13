use anchor_lang::prelude::*;
use anchor_lang::system_program;


use crate::state::{Bet, BettingWindow};
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(window_id: u64)]
pub struct PlaceBet<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 8 + 8 + 4 + 1 + 8 + 8 + 8 + 1000, // Adjust space as needed
        seeds = [b"betting_window", window_id.to_le_bytes().as_ref()],
        bump
    )]
    pub betting_window: Account<'info, BettingWindow>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(window_id: u64)]
pub struct WeatherDegrees<'info> {
    #[account(
        mut,
        seeds = [b"betting_window", window_id.to_le_bytes().as_ref()],
        bump
    )]
    pub betting_window: Account<'info, BettingWindow>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(window_id: u64)]
pub struct ResolveBet<'info> {
    #[account(
        mut,
        seeds = [b"betting_window", window_id.to_le_bytes().as_ref()],
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

#[derive(Accounts)]
#[instruction(window_id: u64)]
pub struct ClaimPayout<'info> {
    #[account(
        mut,
        seeds = [b"betting_window", window_id.to_le_bytes().as_ref()],
        bump,
        constraint = betting_window.resolved @ ErrorCode::NotResolved
    )]
    pub betting_window: Account<'info, BettingWindow>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>, // Still included for consistency
}

#[derive(Accounts)]
#[instruction(window_id: u64)]
pub struct ResetBet<'info> {
    #[account(
        mut,
        seeds = [b"betting_window", window_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub betting_window: Account<'info, BettingWindow>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn place_bet(ctx: Context<PlaceBet>, window_id: u64, prediction: i8, amount: u64) -> Result<()> {
    
    let betting_window = &mut ctx.accounts.betting_window;
    let user = &ctx.accounts.user;
    let clock = &ctx.accounts.clock;

    if prediction <= 0 {
        return Err(ErrorCode::InvalidPrediction.into());
    }

    // Initialize or reset window if resolved
    let current_slot = clock.slot;
    if betting_window.start_slot == 0 || betting_window.resolved {
        betting_window.start_slot = current_slot;
        betting_window.end_slot = current_slot + 10; // 10 slots == 4 seconds, each slot is 400ms
        betting_window.bets = Vec::new();
        betting_window.resolved = false;
        betting_window.weather_result = 0;
        betting_window.pool = 0;
    }

    // Check if betting window is still open
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

    betting_window.pool += amount;

    Ok(())
}

// pub fn weather_degrees(ctx: Context<WeatherDegrees>, window_id: u64) -> Result<()> {
//     let betting_window = &mut ctx.accounts.betting_window;
//     let clock = &ctx.accounts.clock;

//     // Ensure betting window is closed
//     if clock.slot < betting_window.end_slot {
//         return Err(ErrorCode::BettingNotClosed.into());
//     }

//     // Simulate weather outcome (in production, use an oracle)
//     let pseudo_random = (clock.slot % 2) as i8; // 0 (no rain) or 1 (rain)
//     betting_window.weather_result = pseudo_random;

//     Ok(())
// }

pub fn resolve_bet(ctx: Context<ResolveBet>, window_id: u64, result: i8) -> Result<()> {
    let betting_window = &mut ctx.accounts.betting_window;

    if betting_window.bets.is_empty() {
        return Err(ErrorCode::NoBets.into());
    }

    betting_window.resolved = true;
    betting_window.weather_result = result;
    Ok(())
}

pub fn claim_payout(ctx: Context<ClaimPayout>, window_id: u64) -> Result<()> {
    let betting_window = &mut ctx.accounts.betting_window;
    let user = &ctx.accounts.user;

    if betting_window.pool == 0 {
        return Err(ErrorCode::NoBet.into());
    }

    let mut user_bet = None;
    for bet in betting_window.bets.iter() {
        if bet.user == user.key() && bet.prediction == betting_window.weather_result {
            user_bet = Some(bet);
            break;
        }
    }

    let bet = user_bet.ok_or(ErrorCode::YouLost)?;
    let payout = bet.amount * 2;

    // Direct lamport transfer from betting_window to user
    **betting_window.to_account_info().try_borrow_mut_lamports()? -= payout;
    **user.to_account_info().try_borrow_mut_lamports()? += payout;

    Ok(())
}

pub fn reset_bet(ctx: Context<ResetBet>, window_id: u64) -> Result<()> {
    let betting_window = &mut ctx.accounts.betting_window;

    // Clear bets and reset fields
    betting_window.bets = Vec::new();
    betting_window.pool = 0;
    betting_window.resolved = false;
    betting_window.weather_result = 0;
    betting_window.start_slot = 0;
    betting_window.end_slot = 0;

    Ok(())
}