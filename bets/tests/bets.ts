import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Bets } from "../target/types/bets";
import { expect } from "chai";


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

describe("Bets", () => {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const program = anchor.workspace.Bets as Program<Bets>;
	const wallet = provider.wallet as anchor.Wallet;

	const BET_AMOUNT = web3.LAMPORTS_PER_SOL;

	const NoRain = 0;
	const Rain = 1;

	const admin = wallet.publicKey;

	const user1 = web3.Keypair.generate();
	const user2 = web3.Keypair.generate();
	const user3 = web3.Keypair.generate();
	before(async () => {
		await provider.connection.requestAirdrop(user1.publicKey, BET_AMOUNT);
		await provider.connection.requestAirdrop(user2.publicKey, BET_AMOUNT);
		await provider.connection.requestAirdrop(user3.publicKey, BET_AMOUNT);
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

	beforeEach(async () => {
		bettingWindowPDA = await getBettingWindowPDA(program, weatherWindowId);
	});

	// Clear the state of the previous testing, because it uses the same PDA for each testing.
	it("reset bet", async () => {
		await program.methods
			.resetBet(new BN(weatherWindowId))
			.accounts({
				bettingWindow: bettingWindowPDA,
				user: admin,
				clock: web3.SYSVAR_CLOCK_PUBKEY,
			})
			.rpc();

		expect(1).to.equal(1);
	});

	it("User 1 places a <1 sol> bet on <rain>", async () => {
		const prediction = Rain;

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
		expect(bettingWindow.rainPool.toNumber()).to.equal(BET_AMOUNT);
		expect(bettingWindow.noRainPool.toNumber()).to.equal(0);
		expect(bettingWindow.resolved).to.be.false;
	});

	it("User 2 places a <1 sol> bet on <no rain>", async () => {
		const prediction = NoRain;

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
		expect(bettingWindow.rainPool.toNumber()).to.equal(BET_AMOUNT);
		expect(bettingWindow.noRainPool.toNumber()).to.equal(BET_AMOUNT);
		expect(bettingWindow.resolved).to.be.false;
	});

	it("Resolves bets and distribute rewards", async () => {

		console.log("Wait 5 seconds for the betting to expire.")
		await advanceSlots(12); // ~ 5 seconds

		await program.methods
			.resolveBet(new BN(weatherWindowId), Rain)
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

		const balance1 = await provider.connection.getBalance(user1.publicKey);
		console.log(`User 1 balance: ${balance1} SOL`);
		expect(balance1).to.equal(2 * BET_AMOUNT);

		const balance2 = await provider.connection.getBalance(user2.publicKey);
		console.log(`User 2 balance: ${balance2} SOL`);
		expect(balance2).to.equal(0);
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
