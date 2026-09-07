# RecallVault — submission notes

**Live app:** https://recallvault-app.vercel.app  
**Source:** https://github.com/LIBRAPHILIP/recall-vault  
**Intelligent Contract (Studionet):** [`0x5FCDa9ef4b63aE85280beFbbcBf8203c5e925cF4`](https://explorer-studio.genlayer.com/address/0x5FCDa9ef4b63aE85280beFbbcBf8203c5e925cF4)  
**Deploy tx:** [`0xdfaa9debef3eb0182f7ffa343cd6729dafb3b4e4582d1eb7ce6f1f3eff60f9f9`](https://explorer-studio.genlayer.com/tx/0xdfaa9debef3eb0182f7ffa343cd6729dafb3b4e4582d1eb7ce6f1f3eff60f9f9)

This is a complete GenLayer app: one real Intelligent Contract, a wallet frontend that calls it, and a workflow where GenLayer owns the decision that moves money.

---

## What it does

A sponsor (manufacturer, retailer, insurer, or advocacy group) lists a product and locks GEN. A consumer files a claim with a lot / serial / VIN and a public proof URL. Anyone can trigger `adjudicate`. The contract fetches **live official recall databases**, validators reach consensus on coverage, and the bond pays or the claim is rejected.

## The problem it solves

Recalls are public. Refunds are not.

- FDA, NHTSA, and CPSC already publish whether a product is recalled.
- Payout still runs through the same company that shipped the defect.
- Lot ranges like “4411 through 4488” and model-year lists cannot be expressed in a traditional smart contract.
- A hosted LLM or a single oracle just moves the trusted party.

RecallVault makes the official record the condition of an on-chain bond. Counterparties do not trust the app operator.

## How to use it

1. Open https://recallvault-app.vercel.app
2. Connect **MetaMask** or **OKX Wallet**. The app calls `client.connect("studionet")` (chain ID `61999`).
3. Get test GEN from [studio.genlayer.com](https://studio.genlayer.com) (built-in faucet).
4. **Post a bond** — use the live official scanner so the product actually exists in FDA/NHTSA.
5. **File a claim** with lot/serial and a public `https://` URL.
6. **Adjudicate from official data.** Watch pending → proposing → committing → revealing → accepted → finalized.
7. Read the stored agency, recall number, and reasoning. GEN pays if the unit is in scope.

Local run: `cd frontend && npm install && npm run dev` (`.env.example` already points at the live contract).

---

## Quality bar

### 1. Solves a real trust problem — not a better LLM response

The state change is a **payout or a denial**, not a stored paragraph. The LLM only interprets official recall language (lot ranges, model years, product descriptions). Equivalence compares decision fields (`recall_found`, `in_scope`, `lot_in_scope`, `agency`, payout bucket). Reasoning text is allowed to differ.

This is not “ask an LLM and write the answer on-chain.”

### 2. Uses live / authoritative data when facts matter

`adjudicate()` builds deterministic government URLs and fetches them inside a non-deterministic block:

- openFDA food / drug / device enforcement
- NHTSA `recallsByVehicle`
- CPSC SaferProducts

The frontend scanner is UX only. Validators independently re-fetch the same sources. Compacted fields (recall number, product description, code_info, summary) are the evidence.

### 3. Complete source and accurate docs

- Contract: `contracts/recall_vault.py`
- Frontend: `frontend/src` (genlayer-js `readContract` / `writeContract` / `waitForTransactionReceipt`)
- Tests: `tests/direct/test_recall_vault.py` (FDA pay, FDA deny, NHTSA vehicle, reserve accounting)
- This file + `README.md` + `HOW_TO_DEMO.md`

The live network is **Studionet**, not Bradbury. Bradbury’s faucet is interactive (GitHub login). Studio `sim_fundAccount` is what funded the deployer. Docs match that deploy.

### 4. Frontend genuinely calls the contract and tracks the full lifecycle

Every read is `readContract` (`get_protocol`, `get_vaults`, `get_claims`, `preview_sources`).  
Every write is wallet-signed `writeContract` (`list_product`, `fund_bond`, `file_claim`, `adjudicate`, `honor_claim`, `cancel_claim`, `withdraw_surplus`).

`sendAndTrack` in `frontend/src/lib/genlayer.ts`:

1. `client.connect(network)` so MetaMask/OKX is on GenLayer
2. `writeContract` → hash
3. Poll `getTransaction` and map numeric status `0..7` to PENDING → … → ACCEPTED / FINALIZED
4. `waitForTransactionReceipt(ACCEPTED)` then FINALIZED
5. Surface `UNDETERMINED`, execution errors, and explorer links — not a silent spinner

### 5. Meaningfully different from boilerplate, with a path to continued use

Not a football score market. The contract has payable bonds, reserved vs available accounting, honor/cancel paths, category-specific official APIs, and structured payouts.

Continued use: standing manufacturer bonds per SKU, insurer top-ups, advocacy-funded vaults. New official recalls keep arriving at the same government APIs — no redeploy.

---

## Steward revisions (entitlement, payout authority, liveness, VIN, finality)

1. **Entitlement, not only recall scope.** Model: `public_commit_bearer`. Filing stores a commit token `RECALLVAULT:<product_id>:<unit>:<claimant>`. Adjudication **fetches the https proof URL**, requires the token on the page, and requires the page to be a purchase/ownership record (`entitled_document`). Payout requires `entitled && recall_found && in_scope && lot_in_scope`. A GitHub README with no receipt fails even if the token is pasted.

2. **Sponsor-defined payout.** Each vault has `compensation_wei`. Claimants no longer choose `amount_wei`. The LLM returns eligibility booleans only. Paid amount is the vault compensation (capped by remaining bond).

3. **Anti-griefing / liveness.** Filing requires `claim_stake_wei`, reserves only `compensation_wei`, and is capped by `max_open_claims`. Claims expire (`claim_ttl_sec`). Anyone may `release_expired` to unreserve and slash the stake into the bond. Duplicate unit IDs cannot sit open or paid twice.

4. **Vehicle evidence.** NHTSA does not expose a stable public unrepaired-VIN API. Vehicle vaults are explicitly **model-year campaign coverage after VIN decode**: a 17-character VIN is required; vPIC `DecodeVinValues` must match the listing YMM; `recallsByVehicle` establishes the campaign. UI and `vehicle_scope` say this is not manufacturer VIN-list eligibility.

5. **Settlement hardness.** Contract: no adjudicated payout if `lot_in_scope` is false (also requires entitled + recall_found + in_scope). Frontend: payout writes (`adjudicate`, `honor_claim`) are marked irreversible only when status is FINALIZED and execution is FINISHED_WITH_RETURN.

## What to review in the code

| Path | Why it matters |
|---|---|
| `contracts/recall_vault.py` `_evaluate_claim` | Independent validator re-run, not leader-output schema checks |
| `contracts/recall_vault.py` `_official_urls` | Deterministic FDA/NHTSA/CPSC endpoints |
| `frontend/src/lib/genlayer.ts` `sendAndTrack` | Full lifecycle |
| `frontend/src/lib/wallet.ts` | MetaMask + OKX via EIP-6963 |
| `tests/direct/test_recall_vault.py` | Payout, denial, NHTSA, reserve math |
