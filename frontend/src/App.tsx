import { FC, useState } from 'react';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN, Idl } from '@project-serum/anchor';
import bs58 from 'bs58';
import idl from './idl/bets.json';

// Override the program ID from the IDL with the correct one from Anchor.toml
const programID = new PublicKey("9ZXoWhyzVVbLsR8REqgH763W8PWZ2r1RFvdVgDjFMWJF");

const anchorIdl = {
    ...idl,
    accounts: [{
      name: "BettingWindow",
      type: {
        kind: "struct",
        fields: [
          { name: "startSlot", type: "u64" },
          { name: "endSlot", type: "u64" },
          { name: "bets", type: { vec: { defined: "Bet" } } },
          { name: "resolved", type: "bool" },
          { name: "weatherResult", type: "i8" },
          { name: "pool", type: "u64" }
        ]
      }
    }],
    types: [{
      name: "Bet",
      type: {
        kind: "struct",
        fields: [
          { name: "user", type: "publicKey" },
          { name: "amount", type: "u64" },
          { name: "prediction", type: "i8" }
        ]
      }
    }],
    instructions: [
      {
        name: "placeBet",
        accounts: [
          { name: "bettingWindow", isMut: true, isSigner: false },
          { name: "user", isMut: true, isSigner: true },
          { name: "systemProgram", isMut: false, isSigner: false },
          { name: "clock", isMut: false, isSigner: false }
        ],
        args: [
          { name: "windowId", type: "u64" },
          { name: "prediction", type: "i8" },
          { name: "amount", type: "u64" }
        ]
      }
    ]
};

const App: FC = () => {
  const [prediction, setPrediction] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0.1);
  const [windowId, setWindowId] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [privateKey, setPrivateKey] = useState<string>('');
  const [keyPair, setKeyPair] = useState<Keypair | null>(null);
  const [showBettingInterface, setShowBettingInterface] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const loadFromLocalKeyfile = async () => {
    try {
      // Create a file input element
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        // @ts-ignore
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            // @ts-ignore
            const keyfileJson = JSON.parse(event.target.result);
            // Handle array format from Solana CLI key file
            if (Array.isArray(keyfileJson)) {
              const uint8Array = new Uint8Array(keyfileJson);
              const keypair = Keypair.fromSecretKey(uint8Array);
              // Convert to base58 for display in text field
              const base58PrivateKey = bs58.encode(keypair.secretKey);
              setPrivateKey(base58PrivateKey);
              setError('');
            } else {
              setError('Invalid key file format. Expected JSON array.');
            }
          } catch (err) {
            console.error('Error parsing key file:', err);
            setError('Error reading key file. Make sure it is a valid Solana key file.');
          }
        };
        reader.readAsText(file);
      };
      
      // Trigger click to open file dialog
      input.click();
    } catch (err) {
      console.error('Error loading key file:', err);
      setError('Error loading key file.');
    }
  };

  const handlePrivateKeySubmit = () => {
    try {
      // Validate and create keypair from private key
      const decodedKey = bs58.decode(privateKey);
      const newKeyPair = Keypair.fromSecretKey(decodedKey);
      setKeyPair(newKeyPair);
      setShowBettingInterface(true);
      setError('');
    } catch (err) {
      console.error('Invalid private key:', err);
      setError('Invalid private key format. Please check and try again.');
    }
  };

  const placeBet = async () => {
    if (!keyPair) return;

    try {
      const connection = new Connection('http://localhost:8899', 'confirmed');
      
      // Create custom signer that uses our keypair
      const customWallet = {
        publicKey: keyPair.publicKey,
        signTransaction: (tx: web3.Transaction) => {
          tx.sign(keyPair);
          return Promise.resolve(tx);
        },
        signAllTransactions: (txs: web3.Transaction[]) => {
          txs.forEach(tx => tx.sign(keyPair));
          return Promise.resolve(txs);
        }
      };
      
      const provider = new AnchorProvider(connection, customWallet as any, {});
      const program = new Program(anchorIdl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowId).toArrayLike(Buffer, 'le', 8)],
        programID
      );
      
      const balance = await connection.getBalance(keyPair.publicKey);
      console.log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
      console.log('Connection URL:', connection.rpcEndpoint);
      console.log('Public Key:', keyPair.publicKey.toBase58());
      
      const latestBlockhash = await connection.getLatestBlockhash();
      
      const tx = await program.methods
        .placeBet(new BN(windowId), prediction, new BN(amount * LAMPORTS_PER_SOL))
        .accounts({
          bettingWindow,
          user: keyPair.publicKey,
          systemProgram: SystemProgram.programId,
          clock: web3.SYSVAR_CLOCK_PUBKEY,
        })
        .transaction();

      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = keyPair.publicKey;

      // Sign transaction with keypair
      tx.sign(keyPair);
      const signature = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash
      });

      setStatus('Bet placed successfully!');
    } catch (error) {
      console.error('Error placing bet:', error);
      setStatus('Error placing bet. Check console for details.');
    }
  };

  const claimPayout = async () => {
    if (!keyPair) return;

    try {
      const connection = new Connection('http://localhost:8899', 'confirmed');
      
      // Create custom signer that uses our keypair
      const customWallet = {
        publicKey: keyPair.publicKey,
        signTransaction: (tx: web3.Transaction) => {
          tx.sign(keyPair);
          return Promise.resolve(tx);
        },
        signAllTransactions: (txs: web3.Transaction[]) => {
          txs.forEach(tx => tx.sign(keyPair));
          return Promise.resolve(txs);
        }
      };
      
      const provider = new AnchorProvider(connection, customWallet as any, {});
      const program = new Program(idl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowId).toArrayLike(Buffer, 'le', 8)],
        programID
      );

      const latestBlockhash = await connection.getLatestBlockhash();

      const tx = await program.methods
        .claimPayout(new BN(windowId))
        .accounts({
          bettingWindow,
          user: keyPair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = keyPair.publicKey;

      // Sign transaction with keypair
      tx.sign(keyPair);
      const signature = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash
      });

      setStatus('Payout claimed successfully!');
    } catch (error) {
      console.error('Error claiming payout:', error);
      setStatus('Error claiming payout. Check console for details.');
    }
  };

  return (
    <div className="container">
      <h1>Solana Weather Betting</h1>
      
      {!showBettingInterface ? (
        <div className="private-key-form">
          <h2>Enter Your Private Key</h2>
          <p>Paste your Solana private key to access the betting platform</p>
          <div>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="Enter private key (base58 encoded)"
              style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <button 
              onClick={handlePrivateKeySubmit}
              style={{ padding: '10px 20px', cursor: 'pointer' }}
            >
              Submit
            </button>
            <button 
              onClick={loadFromLocalKeyfile}
              style={{ padding: '10px 20px', cursor: 'pointer' }}
            >
              Load from Key File
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#666' }}>
            To load from Solana CLI default location at ~/.config/solana/id.json, click "Load from Key File"
          </p>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
      ) : (
        <div className="betting-form">
          <div style={{ marginBottom: '20px' }}>
            <strong>Connected Address:</strong> {keyPair?.publicKey.toBase58()}
          </div>
          <div>
            <label>Window ID:</label>
            <input
              type="number"
              value={windowId}
              onChange={(e) => setWindowId(Number(e.target.value))}
            />
          </div>
          <div>
            <label>Prediction (temperature):</label>
            <input
              type="number"
              value={prediction}
              onChange={(e) => setPrediction(Number(e.target.value))}
            />
          </div>
          <div>
            <label>Amount (SOL):</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              step="0.1"
            />
          </div>
          <button onClick={placeBet}>Place Bet</button>
          <button onClick={claimPayout}>Claim Payout</button>
          {status && <p className="status">{status}</p>}
        </div>
      )}
    </div>
  );
};

export default App;