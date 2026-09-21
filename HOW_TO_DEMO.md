# Live demo script (5–7 minutes)

Live: https://recallvault-app.vercel.app  
Contract: `0x689dC76bc82cc94738EE139d917F676D0C435490` on Studionet.

Publish `RECALLVAULT:<vault>:<unit>:<yourAddress>` on an https page before filing. That is **self-published bearer evidence**, not verified ownership. Payout is the vault’s fixed compensation. Cancel takes a stake penalty and cooldown. `honor_claim` is sponsor settlement, not a consensus eligibility finding. Vehicle claims need a 17-character VIN (model-year coverage after vPIC decode).

## Setup (once)

1. MetaMask or OKX Wallet.
2. When the app prompts, approve adding **GenLayer Studio Network** (chain ID `61999`, RPC `https://studio.genlayer.com/api`).
3. Fund the wallet from [studio.genlayer.com](https://studio.genlayer.com) (💧 faucet). Studionet amounts are whole GEN, not 18-decimal wei.

## Script

1. **Open the Brief.** One sentence: *recalls are public, refunds are not.* Point at FDA / NHTSA / CPSC.
2. **Connect wallet.** Confirm the network pill says Studionet. The footer shows the live contract.
3. **Post a bond.** Set a fixed payout (e.g. 4 GEN), a claim stake, and TTL. Scan official databases, pick a real FDA food recall, lock a bond that covers at least one payout.
4. **Open the vault.** Show the commit token, publish it on an https receipt page, then file. You do not choose the payout amount.
5. **Adjudicate.** The contract — not the UI — fetches openFDA. Validators will disagree if they cannot reproduce the ruling.
6. **Show the ruling.** Agency, recall number, reasoning, payout (`paid`) or a clean `rejected` if the product was nonsense.
7. **Optional:** fund the same bond from a second wallet (insurer path). Honor a claim as sponsor without LLM.

## What reviewers should see

- Wallet signature
- Transaction hash that opens on the Studio explorer
- Status changes: PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED
- A ruling that cites an official recall number

If adjudication returns `UNDETERMINED`, say so. That is real consensus. Re-submit or pick a clearer official record.
