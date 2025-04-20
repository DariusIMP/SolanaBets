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
      },
      {
        name:"resolveBet",
        accounts: [
          { name: "bettingWindow", isMut: true, isSigner: false },
          { name: "user", isMut: true, isSigner: true },
          { name: "systemProgram", isMut: false, isSigner: false },
          { name: "clock", isMut: false, isSigner: false }
        ],
        args: [
          { name: "windowId", type: "u64" },
          { name: "result", type: "i8" }
        ]
      },
      {
        name: "claimPayout",
        accounts: [
          { name: "bettingWindow", isMut: true, isSigner: false },
          { name: "user", isMut: true, isSigner: true },
          { name: "systemProgram", isMut: false, isSigner: false }
        ],
        args: [
          { name: "windowId", type: "u64" }
        ]
      }
    ]
};

const App: FC = () => {
  const { wallet, publicKey, signTransaction } = useWallet();
  const [prediction, setPrediction] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [windowId, setWindowId] = useState<number>(0);
  const [status, setStatus] = useState<string>('');
  const [windows, setWindows] = useState<{[key: number]: any}>({});
  const [activeWindow, setActiveWindow] = useState<number | null>(null);
  const [result, setResult] = useState<number>(0);
  const [windowIdAdmin, setWindowIdAdmin] = useState<number>(0);

  const placeBet = async () => {
    if (!publicKey || !signTransaction) return;

    if (!amount) {
      setStatus('Amount is required');
      return;
    }

    try {
        const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
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
        // Get window information after placing bet
        await getWindowStatus();
      } catch (error) {
        console.error('Error placing bet:', error);
        setStatus('Error placing bet. Check console for details.');
      }
  }; 
  
  const resolveBet = async () => {
    if (!publicKey || !signTransaction) return;

    if (!result) {
      setStatus('Result is required');
      return;
    }
    try{
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      const provider = new AnchorProvider(connection, wallet as any, {});
      const program = new Program(anchorIdl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowIdAdmin).toArrayLike(Buffer, 'le', 8)],
        programID
      );
      
      // Get latest blockhash
      const latestBlockhash = await connection.getLatestBlockhash();

      const tx = await program.methods
        .resolveBet(new BN(windowIdAdmin), result)
        .accounts({
          bettingWindow,
          user: publicKey,
          systemProgram: SystemProgram.programId,
          clock: web3.SYSVAR_CLOCK_PUBKEY,
        })
        .transaction();
        
      // Set recentBlockhash and feePayer
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = publicKey;

      const signedTx = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction({
        signature,
        ...latestBlockhash
      });
      
      setStatus('Bet resolved successfully!');
      // Update window status after resolving
      await getWindowStatus();
      
    }catch(error){
      console.error('Error resolving bet:', error);
      setStatus('Error resolving bet. Check console for details.');
    }
  };

  const claimPayout = async () => {
    if (!publicKey || !signTransaction) return;

    try {
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      const provider = new AnchorProvider(connection, wallet as any, {});
      const program = new Program(anchorIdl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowId).toArrayLike(Buffer, 'le', 8)],
        programID
      );

      // Get latest blockhash
      const latestBlockhash = await connection.getLatestBlockhash();

      // Create transaction
      const tx = await program.methods
        .claimPayout(new BN(windowId))
        .accounts({
          bettingWindow,
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // Set recentBlockhash and feePayer
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = publicKey;

      const signedTx = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      const confirmation = await connection.confirmTransaction({
        signature,
        ...latestBlockhash
      });

      console.log('Confirmation:', confirmation);

      setStatus('Payout claimed successfully!');
    } catch (error) {
      console.error('Error claiming payout:', error);
      setStatus('Error claiming payout. Check console for details.');
    }
  };

  const getWindowStatus = async () => {
    if(!publicKey || !signTransaction) {
      setStatus('Wallet not connected');
      return;
    }

    setStatus('Getting window status...');
    try {
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      const provider = new AnchorProvider(connection, wallet as any, {});
      const program = new Program(anchorIdl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowIdAdmin).toArrayLike(Buffer, 'le', 8)],
        programID
      );

      console.log('Looking for account at:', bettingWindow.toString());
      const bettingWindowAccount = await program.account.bettingWindow.fetch(bettingWindow);
      console.log('Account data:', bettingWindowAccount);
      
      // Save window information
      setWindows(prev => ({
        ...prev,
        [windowIdAdmin]: bettingWindowAccount
      }));
      
      setActiveWindow(windowIdAdmin);
      setStatus(`Window status: ${bettingWindowAccount.resolved ? 'Resolved' : 'Not Resolved'}`);
    } catch (error) {
      console.error('Error getting window status:', error);
      setStatus('Error getting window status');
    }
  }

  const getWindowInfo = async () => {
    if (!publicKey) return;
    
    try {
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      const provider = new AnchorProvider(connection, wallet as any, {});
      const program = new Program(anchorIdl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowIdAdmin).toArrayLike(Buffer, 'le', 8)],
        programID
      );

      const account = await program.account.bettingWindow.fetch(bettingWindow);
      console.log("Window information:");
      console.log("- Total pool:", account.pool.toString());
      console.log("- Result:", account.weatherResult);
      console.log("- Resolved:", account.resolved);
      
      // Find your bet
      const yourBet = account.bets.find((bet: any) => 
        bet.user.toString() === publicKey.toString()
      );
      
      if (yourBet) {
        console.log("Your bet:");
        console.log("- Amount:", yourBet.amount.toString());
        console.log("- Prediction:", yourBet.prediction);
        
        // Check if you won
        if (account.resolved && yourBet.prediction === account.weatherResult) {
          console.log("YOU WON! You can claim your payout.");
        } else if (account.resolved) {
          console.log("You lost. Your prediction doesn't match the result.");
        }
      } else {
        console.log("You don't have any bets in this window.");
      }
    } catch (error) {
      console.error("Error getting information:", error);
    }
  };

  return (
    <main className="container">
      <header className='header'>
        <h1>Solana Weather Betting</h1>
        <WalletMultiButton />
      </header>
      
      {publicKey && (
        <section className="betting-form">
          <div className='form-container'>
            <div className='form-container-inputs'>
              <div>
                <label>Window ID:</label>
                <input
                  type="number"
                  value={windowId}
                  onChange={(e) => setWindowId(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Temperature:</label>
                <input
                  type="number"
                  value={prediction}
                  onChange={(e) => setPrediction(Number(e.target.value))}
                />
              </div>
              <div>
                <label>Amount:</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  step="0.1"
                />
              </div>
              <div className='button-container'>
                <button onClick={placeBet}>Place Bet</button>
                {/* <button onClick={resolveBet}>Resolve Bet</button> */}
                <button onClick={claimPayout}>Claim Payout</button>
                {/* <button onClick={getWindowStatus}>Get Window Status</button>
                <button onClick={getWindowInfo}>Get Window Info</button> */}
              </div>
            </div>
            <div className='form-container-admin'>
              <h2>Admin Panel</h2>
              <div>
                <label>Result:</label>
                <input
                  type="number"
                  value={result}
                  onChange={(e) => setResult(Number(e.target.value))}
                />
                
              </div>
              <div>
                <label>ID:</label>
                <input
                  type="number"
                  value={windowIdAdmin}
                  onChange={(e) => setWindowIdAdmin(Number(e.target.value))}
                />
                
              </div>
              <div className='button-container'>
                <button onClick={getWindowInfo}>Info</button>
                <button onClick={getWindowStatus}>Status</button>
                <button onClick={resolveBet}>Resolve</button>
              </div>
            </div>
           {/*  <div>
              <label>Result:</label>
              <input
                type="number"
                value={result}
                onChange={(e) => setResult(Number(e.target.value))}
              />
            </div> */}
            
          </div>
          {status && <p className="status">{status}</p>}
          
          {/* Window tabs */}
          <div className="windows-tabs">
            {Object.keys(windows).map((windowId) => (
              <button
                key={windowId}
                className={`tab ${activeWindow === Number(windowId) ? 'active' : ''}`}
                onClick={() => setActiveWindow(Number(windowId))}
              >
                Window {windowId}
              </button>
            ))}
          </div>

          {/* Active window information */}
          {activeWindow && windows[activeWindow] && (
            <section className="window-info">
              <h3>Window Information {activeWindow}</h3>
              <div className="info-grid">
                <div>
                  <strong>Start Slot:</strong> {windows[activeWindow].startSlot.toString()}
                </div>
                <div>
                  <strong>End Slot:</strong> {windows[activeWindow].endSlot.toString()}
                </div>
                <div>
                  <strong>Resolved:</strong> {windows[activeWindow].resolved ? 'Yes' : 'No'}
                </div>
                <div>
                  <strong>Weather Result:</strong> {windows[activeWindow].weatherResult}
                </div>
                <div>
                  <strong>Pool:</strong> {(Number(windows[activeWindow].pool) / LAMPORTS_PER_SOL).toFixed(2)} SOL
                </div>
              </div>
              
              <h4>Bets:</h4>
              <div className="bets-list">
                {windows[activeWindow].bets.map((bet: any, index: number) => (
                  <div key={index} className="bet-item">
                    <div><strong>User:</strong> {bet.user.toString()}</div>
                    <div><strong>Amount:</strong> {(Number(bet.amount) / LAMPORTS_PER_SOL).toFixed(2)} SOL</div>
                    <div><strong>Prediction:</strong> {bet.prediction}°C</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
      )}
    </main>
  );
};

export default App;