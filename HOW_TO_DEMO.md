# Live demo script (5–7 minutes)

Use this when recording a walkthrough or presenting to reviewers.

## Setup (once)

1. Deploy `contracts/recall_vault.py` on Studio or Bradbury.
2. Put the address in `frontend/.env`.
3. `cd frontend && npm install && npm run dev`
4. Install MetaMask or OKX Wallet. Fund it from https://testnet-faucet.genlayer.foundation

## Script

1. **Open the Brief.** State the problem in one sentence: *recalls are public, refunds are not.* Point at the three official sources.
2. **Connect wallet.** Show MetaMask *or* OKX. Confirm the network pill says Testnet Bradbury (or Studionet).
3. **Post a bond.** Click “Scan official databases.” Pick a real ongoing FDA food recall. Fill brand/name from that record. Lock 2–5 GEN. Confirm the wallet popup. Watch the lifecycle strip go through consensus.
4. **Open the vault.** File a claim with a lot number that matches the recall’s code info, a public `https://` URL (your GitHub README is fine), and 1 GEN.
5. **Adjudicate.** This is the money shot. Explain: the contract — not the UI — is fetching openFDA right now. Validators will disagree if they cannot reproduce the ruling.
6. **Show the ruling.** Agency, recall number, reasoning, payout. If the lot is clearly covered you should see `paid`. If you used a nonsense product you should see `rejected` and the bond stay intact.
7. **Optional:** from a second wallet, fund the same bond (insurer / advocacy path). From the sponsor wallet, honor a second claim without LLM.

## What reviewers should see

- Wallet signature (not a mocked button)
- Transaction hash that opens on the GenLayer explorer
- Status changes: PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED
- A ruling that cites an official recall number

If adjudication returns `UNDETERMINED`, say so. That is real consensus, not a crash. Re-submit or pick a clearer official record.
