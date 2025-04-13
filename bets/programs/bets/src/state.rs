use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct BettingWindow {
    pub start_slot: u64,        // Slot when betting starts
    pub end_slot: u64,         // Slot when betting resolves
    pub bets: Vec<Bet>,        // List of bets
    pub resolved: bool,        // Whether bets are resolved
    pub weather_result: i8,    // Final weather outcome (temperature)
    pub pool: u64,        // Total SOL bet on temperature
}

#[account]
#[derive(Default)]
pub struct Bet {
    pub user: Pubkey,          // Bettor's public key
    pub amount: u64,           // SOL amount bet in lamports
    pub prediction: i8,        // temperature
}