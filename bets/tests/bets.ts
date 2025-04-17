import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Bets } from "../target/types/bets";
import { expect } from "chai";
const { Keypair } = require("@solana/web3.js");


// Helper function to generate PDA for BettingWindow
async function getBettingWindowPDA(program: Program<Bets>, windowId: number) {
	const [bettingWindowPDA] = web3.PublicKey.findProgramAddressSync(
		[
			Buffer.from("betting_window"),
			new BN(windowId).toArrayLike(Buffer, "le", 8),
		],
		program.programId
	);
	return bettingWindowPDA;
}

async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function near(num1: number, num2: number, tolerance: number) {
	return Math.abs(num2 - num1) <= tolerance;
}

async function airdrop(provider: anchor.AnchorProvider, user: web3.PublicKey, amount: number) {
	// Request an airdrop
	const airdropSignature = await provider.connection.requestAirdrop(
		user, amount
	);

	// Wait for confirmation
	const latestBlockHash = await provider.connection.getLatestBlockhash();
	await provider.connection.confirmTransaction({
		blockhash: latestBlockHash.blockhash,
		lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
		signature: airdropSignature,
	});

	const bal = await provider.connection.getBalance(user);
	console.log(`airdrop<${user}> : ${bal} lamports`);
}


describe("Bets", () => {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const program = anchor.workspace.Bets as Program<Bets>;
	const wallet = provider.wallet as anchor.Wallet;

	const BET_AMOUNT = web3.LAMPORTS_PER_SOL * 0.0001;

	const TEMPERATUER_20_DEGREES = 20;

	const admin = wallet.publicKey;


	const user1 = Keypair.fromSecretKey(Uint8Array.from([4, 135, 60, 120, 198, 65, 51, 78, 250, 236, 183, 209, 123, 146, 219, 196, 31, 226, 37, 38, 193, 62, 135, 186, 163, 126, 218, 13, 201, 4, 12, 27, 205, 8, 45, 223, 28, 133, 221, 178, 170, 58, 120, 112, 105, 66, 196, 205, 212, 194, 82, 57, 80, 181, 32, 89, 157, 117, 31, 3, 127, 120, 88, 201]));
	const user2 = Keypair.fromSecretKey(Uint8Array.from([203, 44, 86, 210, 179, 226, 160, 166, 198, 209, 133, 25, 120, 172, 206, 83, 26, 235, 104, 226, 125, 154, 106, 181, 252, 83, 52, 78, 194, 7, 252, 253, 115, 162, 93, 238, 74, 206, 193, 58, 79, 27, 52, 221, 13, 83, 212, 86, 239, 237, 149, 112, 57, 247, 70, 4, 72, 88, 170, 203, 19, 146, 26, 133]));
	// console.log("wallet 1", user1.secretKey);
	// console.log("wallet 2", user2.secretKey);

	let balance1: number;
	let balance2: number;

	before(async () => {
		balance1 = await provider.connection.getBalance(user1.publicKey);
		if (balance1 < 2 * BET_AMOUNT) {
			console.log(`user1 insufficient, trying to airdrop 1 sol to ${user1.publicKey}`);
			await airdrop(provider, user1.publicKey, web3.LAMPORTS_PER_SOL); // airdrop 1 SOL
			balance1 = await provider.connection.getBalance(user1.publicKey);
		}

		balance2 = await provider.connection.getBalance(user2.publicKey);
		if (balance2 < 2 * BET_AMOUNT) {
			console.log(`user2 insufficient, trying to airdrop 1 sol to ${user2.publicKey}`);
			await airdrop(provider, user2.publicKey, web3.LAMPORTS_PER_SOL); // airdrop 1 SOL
			balance2 = await provider.connection.getBalance(user2.publicKey);
		}

		bettingWindowPDA = await getBettingWindowPDA(program, weatherWindowId);
	});

	let bettingWindowPDA: web3.PublicKey;
	const weatherWindowId = 1; // Fixed for testing

	// Advance N slots by sending N transactions
	async function advanceSlots(slots: number) {
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

	// Clear the state of the previous testing, because it uses the same PDA for each testing.
	it("reset bet", async () => {
		try {
			await program.methods
				.resetBet(new BN(weatherWindowId))
				.accounts({
					bettingWindow: bettingWindowPDA,
					user: admin,
					clock: web3.SYSVAR_CLOCK_PUBKEY,
				})
				.rpc();
		} catch (e) {
			// first reset will fail, just ignore
		}
	});

	it("User 1 places a <1 sol> bet on <20 degrees>", async () => {

		const prediction = TEMPERATUER_20_DEGREES;

		await program.methods
			.placeBet(new BN(weatherWindowId), prediction, new BN(BET_AMOUNT))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: user1.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.signers([user1])
			.rpc();

		const bettingWindow = await program.account.bettingWindow.fetch(bettingWindowPDA);
		expect(bettingWindow.bets.length).to.equal(1);
		expect(bettingWindow.bets[0].user.toBase58()).to.equal(user1.publicKey.toBase58());
		expect(bettingWindow.bets[0].amount.toNumber()).to.equal(BET_AMOUNT);
		expect(bettingWindow.bets[0].prediction).to.equal(prediction);
		expect(bettingWindow.pool.toNumber()).to.equal(BET_AMOUNT);
		expect(bettingWindow.resolved).to.be.false;
	});

	it("User 2 places a <1 sol> bet on <25 degrees>", async () => {
		const prediction = 25;

		await program.methods
			.placeBet(new BN(weatherWindowId), prediction, new BN(BET_AMOUNT))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: user2.publicKey,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.signers([user2])
			.rpc();

		const bettingWindow = await program.account.bettingWindow.fetch(bettingWindowPDA);
		expect(bettingWindow.bets.length).to.equal(2);

		expect(bettingWindow.bets[1].user.toBase58()).to.equal(user2.publicKey.toBase58());
		expect(bettingWindow.bets[1].amount.toNumber()).to.equal(BET_AMOUNT);
		expect(bettingWindow.bets[1].prediction).to.equal(prediction);
		expect(bettingWindow.pool.toNumber()).to.equal(BET_AMOUNT * 2);
		expect(bettingWindow.resolved).to.be.false;
	});

	it("List all bets", async () => {
		const bettingWindow = await program.account.bettingWindow.fetch(bettingWindowPDA);
		console.log(bettingWindow.bets);
	});

	it("Resolves bets and distribute rewards, final temperature: 20 degrees.", async () => {

		console.log("Wait 10 seconds for the betting to expire.")
		console.log("")
		// await advanceSlots(12); // ~ 5 seconds
		await sleep(10000);

		await program.methods
			.resolveBet(new BN(weatherWindowId), TEMPERATUER_20_DEGREES)
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: admin,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

	});

	it("User 1 wins, claim the payout", async () => {
		await program.methods
			.claimPayout(new BN(weatherWindowId))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: user1.publicKey,
				systemProgram: web3.SystemProgram.programId,
			})
			.signers([user1])
			.rpc();
	});
	it("User 2 should fail to claim the payout", async () => {
		try {
			await program.methods
				.claimPayout(new BN(weatherWindowId))
				.accounts({
					bettingWindow: bettingWindowPDA,
					user: user2.publicKey,
					systemProgram: web3.SystemProgram.programId,
				})
				.signers([user2])
				.rpc();
		} catch (e) {
			console.log("User 2 claim fail: " + e);
		}
	});


	it("Check balances", async () => {
		console.log();
		const TOLERANCE = 100000; // transaction fee

		const balance1_after = await provider.connection.getBalance(user1.publicKey);
		console.log(`User 1 balance increased: ${balance1_after - balance1} lamports`);
		expect(balance1).to.be.closeTo(balance1 + BET_AMOUNT, TOLERANCE);

		const balance2_after = await provider.connection.getBalance(user2.publicKey);
		console.log(`User 2 balance increased: ${balance2_after - balance2} SOL`);
		expect(balance2).to.be.closeTo(balance2, TOLERANCE);
	});

	it("Start a new round", async () => {

		let bettingWindow = await program.account.bettingWindow.fetch(bettingWindowPDA);
		expect(bettingWindow.resolved).to.be.true;

		// New round with same windowId
		await program.methods
			.placeBet(new BN(weatherWindowId), 1, new BN(web3.LAMPORTS_PER_SOL))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: admin,
				systemProgram: web3.SystemProgram.programId,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		bettingWindow = await program.account.bettingWindow.fetch(bettingWindowPDA);
		expect(bettingWindow.bets.length).to.equal(1);
		expect(bettingWindow.resolved).to.be.false;
	});
});

