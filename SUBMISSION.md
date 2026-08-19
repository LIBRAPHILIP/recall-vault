# RecallVault — submission notes

## What it is

A complete GenLayer product: **recall-backed consumer escrow**.

Sponsors lock GEN against a product. Claimants file with a lot, serial, or VIN plus a public proof URL. The Intelligent Contract fetches **live official recall databases** (FDA openFDA, NHTSA, CPSC), validators reach consensus on coverage, and the bond pays or the claim is rejected.

GenLayer is the main workflow, not a decoration.

## The problem it solves

Product recalls are a trust failure:

- The official fact already lives in government systems.
- The payout still runs through the company that caused the recall.
- Lot ranges, model-year lists, and natural-language recall notices cannot be expressed in a traditional smart contract.
- A hosted LLM or a single oracle just moves the trusted party.

RecallVault makes the official record the condition of an on-chain bond. Two counterparties do not have to trust each other or the app operator.

This is **not** a prediction market, a football score bot, or “ask an LLM and store the text.” The state transition is a payout (or a denial) after independent verification of public records.

## Why GenLayer is required

A normal EVM contract cannot:

- GET `https://api.fda.gov/food/enforcement.json?...`
- Read NHTSA `recallsByVehicle`
- Decide whether lot `4450` sits inside “lots 4411 through 4488”
- Have multiple validators agree on that judgment

RecallVault uses:

- `gl.nondet.web.get` for authoritative sources
- `gl.nondet.exec_prompt` for structured extraction
- `gl.vm.run_nondet_unsafe` with a validator that **re-runs** the fetch + judgment and compares decision fields (`recall_found`, `in_scope`, `lot_in_scope`, `agency`, payout bucket)
- `@gl.public.write.payable` + `emit_transfer` so the ruling actually moves GEN

The frontend may preview openFDA/NHTSA so users list a real product. It does **not** submit a finished answer for storage.

## How to use it

1. Deploy `contracts/recall_vault.py` (Studio or `genlayer deploy`).
2. Set `frontend/.env`:
   - `VITE_CONTRACT_ADDRESS=0x...`
   - `VITE_NETWORK=testnetBradbury` (or `studionet` / `localnet`)
3. `cd frontend && npm install && npm run dev`
4. Connect **MetaMask** or **OKX Wallet**. The app uses EIP-6963 discovery and `client.connect()` to switch onto the GenLayer chain (Bradbury / Asimov chain ID `4221`).
5. Get test GEN from https://testnet-faucet.genlayer.foundation
6. **Post a bond** on a product (use the live scanner).
7. **File a claim**, then **Adjudicate from official data**.
8. Watch the full lifecycle in the UI: pending → proposing → committing → revealing → accepted → finalized. Failures surface as `UNDETERMINED` / execution error, not a silent spinner.

## What to review in the code

- Contract: `contracts/recall_vault.py`
  - Bond / reserve accounting
  - Deterministic official URL builder
  - Compacted government records (stable fields only)
  - Independent validator comparison (not leader-output schema checks)
  - Payable listing/funding and EOA payouts
- Frontend: `frontend/src/`
  - Real `writeContract` + `waitForTransactionReceipt`
  - Status polling via `getTransaction`
  - Wallet connect for MetaMask and OKX
- Tests: `tests/direct/test_recall_vault.py`

## Credible path to continued use

Standing manufacturer bonds, insurer top-ups, advocacy-funded vaults, and new official recalls hitting the same APIs. No new contract is required for the next listeria notice or airbag campaign.

## Extra review material

- Live official scanner in the “Post a bond” screen (real FDA/NHTSA HTTP from the browser)
- Transaction lifecycle strip on every write
- README demo path
- Direct-mode tests that do not need Studio
