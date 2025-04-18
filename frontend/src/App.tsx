import { FC, useState } from 'react';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN, Idl } from '@project-serum/anchor';
import idl from './idl/bets.json';
import { useWallet } from '@solana/wallet-adapter-react';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

// Override the program ID from the IDL with the correct one from Anchor.toml
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
  const [prediction, setPrediction] = useState<number>();
  const [amount, setAmount] = useState<number>(0.1);
  const [windowId, setWindowId] = useState<number>(1);
  const [status, setStatus] = useState<string>('');
  const [windows, setWindows] = useState<{[key: number]: any}>({});
  const [activeWindow, setActiveWindow] = useState<number | null>(null);

  const placeBet = async () => {
    if (!publicKey || !signTransaction) {
      setStatus('Wallet no conectada');
      return;
    }

    try {
      const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
      const provider = new AnchorProvider(connection, wallet as any, {});
      const program = new Program(anchorIdl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowId).toArrayLike(Buffer, 'le', 8)],
        programID
      );

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

      setStatus('Apuesta colocada exitosamente!');
      // Obtener información de la ventana después de la apuesta
      await getWindowStatus();
    } catch (error) {
      console.error('Error placing bet:', error);
      setStatus('Error al colocar la apuesta. Revisa la consola para más detalles.');
    }
  };

  const claimPayout = async () => {
    if (!publicKey || !signTransaction) {
      setStatus('Wallet no conectada');
      return;
    }

    try {
      const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
      const provider = new AnchorProvider(connection, wallet as any, {});
      const program = new Program(anchorIdl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowId).toArrayLike(Buffer, 'le', 8)],
        programID
      );

      const latestBlockhash = await connection.getLatestBlockhash();

      const tx = await program.methods
        .claimPayout(new BN(windowId))
        .accounts({
          bettingWindow,
          user: publicKey,
          systemProgram: SystemProgram.programId,
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

      setStatus('Pago reclamado exitosamente!');
    } catch (error) {
      console.error('Error claiming payout:', error);
      setStatus('Error al reclamar el pago. Revisa la consola para más detalles.');
    }
  };

  const getWindowStatus = async () => {
    if(!publicKey || !signTransaction) {
      setStatus('Wallet no conectada');
      return;
    }

    setStatus('Obteniendo estado de la ventana...');
    try {
      const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
      const provider = new AnchorProvider(connection, wallet as any, {});
      const program = new Program(anchorIdl as unknown as Idl, programID, provider);

      const [bettingWindow] = PublicKey.findProgramAddressSync(
        [Buffer.from('betting_window'), new BN(windowId).toArrayLike(Buffer, 'le', 8)],
        programID
      );

      console.log('Buscando cuenta en:', bettingWindow.toString());
      const bettingWindowAccount = await program.account.bettingWindow.fetch(bettingWindow);
      console.log('Datos de la cuenta:', bettingWindowAccount);
      
      // Guardar la información de la ventana
      setWindows(prev => ({
        ...prev,
        [windowId]: bettingWindowAccount
      }));
      
      setActiveWindow(windowId);
      setStatus(`Estado de la ventana: ${bettingWindowAccount.resolved ? 'Resuelta' : 'No Resuelta'}`);
    } catch (error) {
      console.error('Error al obtener estado de la ventana:', error);
      setStatus('Error al obtener estado de la ventana');
    }
  };

  return (
    <main className="container">
      <h1>Solana Weather Betting</h1>
      <WalletMultiButton />
      
      {publicKey && (
        <section className="betting-form">
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
          <div className='button-container'>
            <button onClick={placeBet}>Place Bet</button>
            <button onClick={claimPayout}>Claim Payout</button>
            <button onClick={getWindowStatus}>Get Window Status</button>
          </div>
          {status && <p className="status">{status}</p>}
          
          {/* Pestañas de ventanas */}
          <div className="windows-tabs">
            {Object.keys(windows).map((windowId) => (
              <button
                key={windowId}
                className={`tab ${activeWindow === Number(windowId) ? 'active' : ''}`}
                onClick={() => setActiveWindow(Number(windowId))}
              >
                Ventana {windowId}
              </button>
            ))}
          </div>

          {/* Información de la ventana activa */}
          {activeWindow && windows[activeWindow] && (
            <div className="window-info">
              <h3>Información de la Ventana {activeWindow}</h3>
              <div className="info-grid">
                <div>
                  <strong>Slot Inicial:</strong> {windows[activeWindow].startSlot.toString()}
                </div>
                <div>
                  <strong>Slot Final:</strong> {windows[activeWindow].endSlot.toString()}
                </div>
                <div>
                  <strong>Resuelta:</strong> {windows[activeWindow].resolved ? 'Sí' : 'No'}
                </div>
                <div>
                  <strong>Resultado del Clima:</strong> {windows[activeWindow].weatherResult}
                </div>
                <div>
                  <strong>Pool:</strong> {(Number(windows[activeWindow].pool) / LAMPORTS_PER_SOL).toFixed(2)} SOL
                </div>
              </div>
              
              <h4>Apuestas:</h4>
              <div className="bets-list">
                {windows[activeWindow].bets.map((bet: any, index: number) => (
                  <div key={index} className="bet-item">
                    <div><strong>Usuario:</strong> {bet.user.toString()}</div>
                    <div><strong>Cantidad:</strong> {(Number(bet.amount) / LAMPORTS_PER_SOL).toFixed(2)} SOL</div>
                    <div><strong>Predicción:</strong> {bet.prediction}°C</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
};

export default App;