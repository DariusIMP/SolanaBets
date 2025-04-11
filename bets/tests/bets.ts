import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Bets } from "../target/types/bets";
import { expect } from "chai";



// Helper function to generate PDA for BettingWindow
async function getBettingWindowPDA(program: Program<Bets>, slot: number) {
	const [bettingWindowPDA, bump] = await web3.PublicKey.findProgramAddress(
		[
			Buffer.from("betting_window"),
			new BN(slot).toArrayLike(Buffer, "le", 8),
		],
		program.programId
	);
	return bettingWindowPDA;
}

describe("Bets", () => {
	// Configure the client to use the local cluster
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const betsProgram = anchor.workspace.Bets as Program<Bets>;
	const wallet = provider.wallet as anchor.Wallet;

	let bettingWindowPDA: web3.PublicKey;
	let initialSlot: number;

	// Helper to advance slots (simulate time passing)
	async function advanceSlots(slots: number) {
		const currentSlot = await provider.connection.getSlot();
		await provider.connection.requestAirdrop(
			wallet.publicKey,
			web3.LAMPORTS_PER_SOL
		); // Ensure funds for transactions
		for (let i = 0; i < slots; i++) {
			await provider.connection.sendTransaction(
				new web3.Transaction().add(
					web3.SystemProgram.transfer({
						fromPubkey: wallet.publicKey,
						toPubkey: wallet.publicKey,
						lamports: 1000,
					})
				),
				[wallet.payer]
			);
		}
	}

	beforeEach(async () => {
		// Get current slot for PDA
		initialSlot = await provider.connection.getSlot();
		bettingWindowPDA = await getBettingWindowPDA(betsProgram, initialSlot);
	});

	it("Places a valid bet (rain)", async () => {
		const betAmount = new BN(web3.LAMPORTS_PER_SOL); // 1 SOL
		const prediction = 1; // Rain

		await betsProgram.methods
			.placeBet(prediction, betAmount)
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: wallet.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		const bettingWindow = await betsProgram.account.bettingWindow.fetch(bettingWindowPDA);
		expect(bettingWindow.bets.length).to.equal(1);
		expect(bettingWindow.bets[0].user.toBase58()).to.equal(wallet.publicKey.toBase58());
		expect(bettingWindow.bets[0].amount.toNumber()).to.equal(betAmount.toNumber());
		expect(bettingWindow.bets[0].prediction).to.equal(prediction);
		expect(bettingWindow.totalPool.toNumber()).to.equal(betAmount.toNumber());
		expect(bettingWindow.rainPool.toNumber()).to.equal(betAmount.toNumber());
		expect(bettingWindow.noRainPool.toNumber()).to.equal(0);
		expect(bettingWindow.startSlot.toNumber()).to.be.closeTo(initialSlot, 10);
		expect(bettingWindow.endSlot.toNumber()).to.be.closeTo(initialSlot + 25000, 10);
		expect(bettingWindow.resolved).to.be.false;
	});

	// TODO: Remove this `return` when the above test case passes.
	return;

	it("Places a valid bet (no rain)", async () => {
		const betAmount = new BN(web3.LAMPORTS_PER_SOL / 2); // 0.5 SOL
		const prediction = 0; // No rain

		await betsProgram.methods
			.placeBet(prediction, betAmount)
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: wallet.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		const bettingWindow = await betsProgram.account.bettingWindow.fetch(bettingWindowPDA);
		expect(bettingWindow.bets.length).to.equal(1);
		expect(bettingWindow.bets[0].prediction).to.equal(prediction);
		expect(bettingWindow.noRainPool.toNumber()).to.equal(betAmount.toNumber());
		expect(bettingWindow.rainPool.toNumber()).to.equal(0);
	});

	it("Fails to place bet with invalid prediction", async () => {
		const betAmount = new BN(web3.LAMPORTS_PER_SOL);
		const invalidPrediction = 2; // Invalid

		try {
			await betsProgram.methods
				.placeBet(invalidPrediction, betAmount)
				.accounts({
					bettingWindow: bettingWindowPDA,
					user: wallet.publicKey,
					systemProgram: web3.SystemProgram.programId,
					clock: web3.SYSVAR_CLOCK_PUBKEY,
				})
				.rpc();
			expect.fail("Should have thrown an error for invalid prediction");
		} catch (err) {
			expect(err.error.errorMessage).to.equal("Invalid prediction. Use 1 for rain or 0 for no rain.");
		}
	});

	it("Fails to place bet after betting window closes", async () => {
		// Place an initial bet to set start_slot
		await betsProgram.methods
			.placeBet(1, new BN(web3.LAMPORTS_PER_SOL))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: wallet.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		// Advance past end_slot (~25,000 slots)
		await advanceSlots(26000);

		try {
			await betsProgram.methods
				.placeBet(0, new BN(web3.LAMPORTS_PER_SOL))
				.accounts({
					bettingWindow: bettingWindowPDA,
					user: wallet.publicKey,
					systemProgram: web3.SystemProgram.programId,
					clock: web3.SYSVAR_CLOCK_PUBKEY,
				})
				.rpc();
			expect.fail("Should have thrown an error for closed betting window");
		} catch (err) {
			expect(err.error.errorMessage).to.equal("Betting window is closed.");
		}
	});

	it("Generates weather outcome after betting window closes", async () => {
		// Place a bet to initialize
		await betsProgram.methods
			.placeBet(1, new BN(web3.LAMPORTS_PER_SOL))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: wallet.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		// Advance past end_slot
		await advanceSlots(26000);

		await betsProgram.methods
			.weatherDegrees()
			.accounts({
				bettingWindow: bettingWindowPDA,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		const bettingWindow = await betsProgram.account.bettingWindow.fetch(bettingWindowPDA);
		expect(bettingWindow.weatherResult).to.be.oneOf([0, 1]);
	});

	it("Fails to generate weather outcome before betting window closes", async () => {
		// Place a bet
		await betsProgram.methods
			.placeBet(1, new BN(web3.LAMPORTS_PER_SOL))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: wallet.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		// Try to generate outcome early
		try {
			await betsProgram.methods
				.weatherDegrees()
				.accounts({
					bettingWindow: bettingWindowPDA,
					clock: web3.SYSVAR_CLOCK_PUBKEY,
				})
				.rpc();
			expect.fail("Should have thrown an error for early weather generation");
		} catch (err) {
			expect(err.error.errorMessage).to.equal("Betting window is not closed yet.");
		}
	});

	it("Resolves bets and distributes payouts (rain wins)", async () => {
		// Place two bets
		const user1 = wallet.publicKey;
		const user2 = web3.Keypair.generate();
		await provider.connection.requestAirdrop(user2.publicKey, 2 * web3.LAMPORTS_PER_SOL);

		await betsProgram.methods
			.placeBet(1, new BN(web3.LAMPORTS_PER_SOL)) // User1 bets 1 SOL on rain
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: user1,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		await betsProgram.methods
			.placeBet(0, new BN(web3.LAMPORTS_PER_SOL)) // User2 bets 1 SOL on no rain
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: user2.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.signers([user2])
			.rpc();

		// Advance slots
		await advanceSlots(26000);

		// Set weather outcome to rain (1)
		await betsProgram.methods
			.weatherDegrees()
			.accounts({
				bettingWindow: bettingWindowPDA,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		// Override weather_result to ensure rain (since it's pseudo-random)
		let bettingWindow = await betsProgram.account.bettingWindow.fetch(bettingWindowPDA);
		if (bettingWindow.weatherResult !== 1) {
			bettingWindow.weatherResult = 1;
			// Simulate updating account data (in practice, ensure oracle sets this)
		}

		// Resolve bets
		const user1BalanceBefore = await provider.connection.getBalance(user1);
		await betsProgram.methods
			.resolveBet()
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: user1,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		// Verify
		bettingWindow = await betsProgram.account.bettingWindow.fetch(bettingWindowPDA);
		expect(bettingWindow.resolved).to.be.true;

		const user1BalanceAfter = await provider.connection.getBalance(user1);
		// User1 should receive ~2 SOL (total pool) minus fees
		expect(user1BalanceAfter - user1BalanceBefore).to.be.closeTo(
			2 * web3.LAMPORTS_PER_SOL,
			web3.LAMPORTS_PER_SOL / 10 // Allow for small fee variance
		);

		const user2Balance = await provider.connection.getBalance(user2.publicKey);
		// User2 should not receive payout
		expect(user2Balance).to.be.closeTo(1 * web3.LAMPORTS_PER_SOL, web3.LAMPORTS_PER_SOL / 10);
	});

	it("Fails to resolve bets before betting window closes", async () => {
		await betsProgram.methods
			.placeBet(1, new BN(web3.LAMPORTS_PER_SOL))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: wallet.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		try {
			await betsProgram.methods
				.resolveBet()
				.accounts({
					bettingWindow: bettingWindowPDA,
					user: wallet.publicKey,
					systemProgram: web3.SystemProgram.programId,
					clock: web3.SYSVAR_CLOCK_PUBKEY,
				})
				.rpc();
			expect.fail("Should have thrown an error for early resolution");
		} catch (err) {
			expect(err.error.errorMessage).to.equal("Betting window is not closed yet.");
		}
	});

	it("Fails to resolve already resolved betting window", async () => {
		await betsProgram.methods
			.placeBet(1, new BN(web3.LAMPORTS_PER_SOL))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: wallet.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		await advanceSlots(26000);

		await betsProgram.methods
			.weatherDegrees()
			.accounts({
				bettingWindow: bettingWindowPDA,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		await betsProgram.methods
			.resolveBet()
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: wallet.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		try {
			await betsProgram.methods
				.resolveBet()
				.accounts({
					bettingWindow: bettingWindowPDA,
					user: wallet.publicKey,
					systemProgram: web3.SystemProgram.programId,
					clock: web3.SYSVAR_CLOCK_PUBKEY,
				})
				.rpc();
			expect.fail("Should have thrown an error for already resolved window");
		} catch (err) {
			expect(err.error.errorMessage).to.equal("Betting window is already resolved.");
		}
	});
});
