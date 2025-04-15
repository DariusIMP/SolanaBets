# SolanaBets
A learning project for the Encode Solana Bootcamp (March 2025)

# Prerequisites

1. `anchor`
2. `node`

# On chain

In order to start using this project, you need to perform the following:

1) Create a key pair: `solana-keygen new -o ~/.config/solana/id.json`

2) Start local node (in a separate terminal): 
```
solana-test-validator & 
sleep 5 # Wait for validator to start
solana config set --url localhost
```

3) Deploy program (in a separate terminal after step 2):

- `cd bets`
- `pnpm install`
- `anchor build`
- `anchor deploy`
- note the deployed program address, and set it in `./frontend/src/idl/bets.json` as `address`

4) Run frontend (in a separate terminal):

- `cd frontend`
- `npm install`
- `npm run dev`


Once the front end is started, you need to provide the key pair file generated in step 1:
- Click on `Load from Key File`
- Trigger keyboard shortcut: `Command + Shift + . ` to see files prepended with a `.`
- Locate the key file at `~/.config/solana/id.json` and click `Submit`
