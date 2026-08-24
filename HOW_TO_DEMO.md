# Live demo script (5–7 minutes)

Live: https://recallvault-app.vercel.app  
Contract: `0x5372693bd427e52A0677c771D57aeCC027ef32b5` on Studionet.

## Setup (once)

1. MetaMask or OKX Wallet.
2. When the app prompts, approve adding **GenLayer Studio Network** (chain ID `61999`, RPC `https://studio.genlayer.com/api`).
3. Fund the wallet from [studio.genlayer.com](https://studio.genlayer.com) (💧 faucet). Studionet amounts are whole GEN, not 18-decimal wei.

## Script

1. **Open the Brief.** One sentence: *recalls are public, refunds are not.* Point at FDA / NHTSA / CPSC.
2. **Connect wallet.** Confirm the network pill says Studionet. The footer shows the live contract.
3. **Post a bond.** Scan official databases, pick a real FDA food recall, lock 2–5 GEN. Confirm the wallet popup. Watch the lifecycle strip — this is `writeContract`, not a mock.
4. **Open the vault.** File a claim with a lot that matches the recall’s code info, any public `https://` URL, and 1 GEN.
5. **Adjudicate.** The contract — not the UI — fetches openFDA. Validators will disagree if they cannot reproduce the ruling.
6. **Show the ruling.** Agency, recall number, reasoning, payout (`paid`) or a clean `rejected` if the product was nonsense.
7. **Optional:** fund the same bond from a second wallet (insurer path). Honor a claim as sponsor without LLM.

## What reviewers should see

- Wallet signature
- Transaction hash that opens on the Studio explorer
- Status changes: PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED
- A ruling that cites an official recall number

If adjudication returns `UNDETERMINED`, say so. That is real consensus. Re-submit or pick a clearer official record.
