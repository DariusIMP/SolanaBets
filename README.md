# SolanaBets - Weather Betting Application on Solana

A project that allows users to place bets on temperature predictions using the Solana blockchain.

## Project Description

SolanaBets is a dApp (decentralized application) built on the Solana blockchain that allows users to:

- Place bets on temperature predictions
- Claim winnings if they correctly predict the temperature
- View detailed information about betting windows and their status

The project uses Anchor Framework for Solana program development and React for the frontend.

## Architecture

The project is divided into two main parts:

### Solana Program (Smart Contract)

The Solana program manages all the betting logic:

- **BettingWindow**: Data structure that stores information about a betting window, including:
  - Start and end slots
  - List of bets
  - Resolution status
  - Temperature result
  - Size of the betting pool

- **Main Instructions**:
  - `place_bet`: Allows a user to place a bet
  - `resolve_bet`: Resolves a betting window with the actual result
  - `claim_payout`: Allows a user to claim their winnings
  - `reset_bet`: Resets a betting window for a new round

### Frontend (React)

The frontend provides a user interface to interact with the Solana program:

- Wallet connection with `@solana/wallet-adapter-react`
- Form for placing bets
- Admin panel for resolving bets
- Visualization of information about active betting windows

## Prerequisites

- Node.js (v20 or higher)
- Rust and Cargo
- Solana CLI
- Anchor Framework

## Environment Setup

### 1. Initial Setup

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.16.0/install)"

# Install Anchor
npm install -g @project-serum/anchor-cli

# Generate a new Solana wallet
solana-keygen new -o ~/.config/solana/id.json
```

### 2. Project Setup

```bash
# Clone the repository
git clone https://github.com/your-username/SolanaBets.git
cd SolanaBets

# Configure for local development
solana config set --url localhost
```

## Deployment

### 1. Start Local Validator

```bash
solana-test-validator
```

### 2. Deploy the Program

```bash
cd bets
pnpm install
anchor build
anchor deploy
```

Note the deployed program address and update it in `frontend/src/idl/bets.json`.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

## Using the Application

1. **Connect Wallet**: Click on the "Connect" button to connect your Solana wallet.

2. **Place a Bet**:
   - Enter the betting window ID
   - Enter your temperature prediction
   - Set the amount to bet in SOL
   - Click on "Place Bet"

3. **Administration** (for demonstration purposes only):
   - Enter the actual temperature result
   - Click on "Resolve" to determine the winners

4. **Claim Winnings**:
   - If your prediction was correct, you can claim your winnings by clicking on "Claim Payout"

## Technical Features

- **PDAs (Program Derived Addresses)**: Used to create betting window accounts with predictable seeds.
- **Wallet Integration**: Implemented with `@solana/wallet-adapter-react` to facilitate interaction with the program.
- **State Management**: The frontend maintains a state of active betting windows and their information.

