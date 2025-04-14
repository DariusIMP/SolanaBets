import { FC, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN, Idl } from '@project-serum/anchor';
import idl from './idl/bets.json';

const programID = new PublicKey(idl.address);

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
  const { wallet, publicKey, signTransaction } = useWallet();
  const [prediction, setPrediction] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0.1);
  const [windowId, setWindowId] = useState<number>(1);
  const [status, setStatus] = useState<string>('');

  const placeBet = async () => {
    if (!publicKey || !signTransaction) return;

    try {
        const connection = new Connection('http://localhost:8899', 'confirmed');
        const provider = new AnchorProvider(connection, wallet as any, {});
        const program = new Program(anchorIdl as unknown as Idl, programID, provider);
  
        const [bettingWindow] = PublicKey.findProgramAddressSync(
          [Buffer.from('betting_window'), new BN(windowId).toArrayLike(Buffer, 'le', 8)],
          programID
        );
        const balance = await connection.getBalance(publicKey);
        console.log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        console.log('Connection URL:', connection.rpcEndpoint);
        console.log('Public Key:', publicKey.toBase58());
        const latestBlockhash = await connection.getLatestBlockhash();
        
        const tx = await program.methods
          .placeBet(new BN(windowId), prediction, new BN(amount * LAMPORTS_PER_SOL))
          .accounts({
            bettingWindow,
            user: publicKey,
            systemProgram: SystemProgram.programId,
            clock: web3.SYSVAR_CLOCK_PUBKEY,
          })
          .transaction();
  
        tx.recentBlockhash = latestBlockhash.blockhash;
        tx.feePayer = publicKey;
  
        const signedTx = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(signedTx.serialize());
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
    if (!publicKey || !signTransaction) return;

    try {
      const connection = new Connection('http://localhost:8899', 'confirmed');
      const provider = new AnchorProvider(connection, wallet as any, {});
      const program = new Program(idl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowId).toArrayLike(Buffer, 'le', 8)],
        programID
      );

      const tx = await program.methods
        .claimPayout(new BN(windowId))
        .accounts({
          bettingWindow,
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const signedTx = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction({signature, blockhash: tx.recentBlockhash!, lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight});

      setStatus('Payout claimed successfully!');
    } catch (error) {
      console.error('Error claiming payout:', error);
      setStatus('Error claiming payout. Check console for details.');
    }
  };

  return (
    <div className="container">
      <h1>Solana Weather Betting</h1>
      <WalletMultiButton />
      
      {publicKey && (
        <div className="betting-form">
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