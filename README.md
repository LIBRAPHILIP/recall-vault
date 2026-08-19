# RecallVault

**Bonds against official product recalls. Government data decides. Not the manufacturer.**

- Live app: [https://recallvault-app.vercel.app](https://recallvault-app.vercel.app)
- Also: [https://recall-vault-two.vercel.app](https://recall-vault-two.vercel.app)
- Source: [github.com/LIBRAPHILIP/recall-vault](https://github.com/LIBRAPHILIP/recall-vault)

RecallVault is a complete GenLayer application: a Python Intelligent Contract plus a wallet-connected frontend. GenLayer is not a sidecar. The contract fetches live FDA, NHTSA, and CPSC records, reaches consensus on whether a specific lot / serial / vehicle is in scope, and pays GEN from a posted bond.

This is not “a better LLM response.” The LLM is only used to interpret official recall language. The outcome that moves money is an on-chain consensus decision.

## The trust problem

When a food product is contaminated, a drug is mislabeled, or an airbag inflator is defective, the official record already exists:

- [openFDA enforcement reports](https://open.fda.gov/apis/food/enforcement/)
- [NHTSA recalls by vehicle](https://www.nhtsa.gov/nhtsa-datasets-and-apis)
- [CPSC SaferProducts](https://www.saferproducts.gov/)

What does **not** exist is a neutral payout rail. Consumers file with the same company that shipped the defect. Claims sit in a helpdesk. Lot ranges like *“4411 through 4488”* cannot be evaluated by a normal smart contract, and a centralized oracle would just reintroduce a trusted operator.

RecallVault turns that official record into an escrow condition.

## How it works

```
Sponsor                Claimant                 GenLayer validators
   |                      |                              |
   | list_product + GEN   |                              |
   |--------------------->|                              |
   |                      | file_claim                   |
   |                      | (lot, proof URL, amount)     |
   |                      |----------------------------->|
   |                      | adjudicate()                 |
   |                      |----------------------------->|
   |                      |              fetch FDA/NHTSA |
   |                      |              compact records |
   |                      |              LLM structured  |
   |                      |              ruling          |
   |                      |<---- pay or reject + reason -|
```

1. **Post a bond.** A manufacturer, retailer, insurer, or advocacy group lists a product and locks GEN.
2. **File a claim.** A consumer reserves part of that bond with a lot/serial/VIN and a public proof URL.
3. **Adjudicate.** Anyone triggers settlement. The Intelligent Contract builds deterministic official URLs, fetches them inside a non-deterministic block, and asks the model for a structured ruling.
4. **Equivalence.** Validators independently repeat the fetch + judgment. They must agree on `recall_found`, `in_scope`, `lot_in_scope`, `agency`, and a payout bucket. Reasoning text may differ. Money moves only after consensus.
5. **Honor path.** The sponsor can also pay without waiting for official-data consensus.

The frontend can preview live FDA/NHTSA results so a user lists a product that actually has records. That preview is UX. The **decision is never computed in the browser and stored**. The contract re-fetches the sources.

## Repository

```
contracts/recall_vault.py     Intelligent Contract
tests/direct/                 In-memory tests with mocked FDA/NHTSA/LLM
frontend/                     Vite + React app (MetaMask / OKX)
deploy/                       Deploy notes
SUBMISSION.md                 Reviewer notes: problem, use, demo
```

## Contract surface

| Method | Type | What it does |
|---|---|---|
| `list_product(...)` | payable write | Create a vault and lock the initial bond |
| `fund_bond(product_id)` | payable write | Anyone can add GEN |
| `file_claim(...)` | write | Reserve bond for a lot/serial + proof URL |
| `adjudicate(claim_id)` | write | Fetch official sources, reach consensus, pay or reject |
| `honor_claim(claim_id)` | write | Sponsor pays in full without LLM |
| `cancel_claim(claim_id)` | write | Claimant releases the reserve |
| `withdraw_surplus(...)` | write | Sponsor withdraws unreserved GEN |
| `deactivate_product(...)` | write | Stop new claims |
| `get_vaults` / `get_claims` / `get_protocol` | view | Frontend reads |
| `preview_sources(...)` | view | Exact official URLs the contract will hit |

Categories: `food`, `drug`, `device`, `vehicle`, `consumer`.

## Quick start

### 1. Deploy the Intelligent Contract

**Option A — GenLayer Studio (fastest)**

1. Open [studio.genlayer.com](https://studio.genlayer.com)
2. New contract → paste `contracts/recall_vault.py`
3. Deploy
4. Copy the contract address

**Option B — CLI**

```bash
npm install -g genlayer
genlayer network          # pick testnetBradbury, studionet, or localnet
genlayer deploy --contract contracts/recall_vault.py
```

Bradbury (production-like testnet, real LLM workloads):

- RPC: `https://rpc-bradbury.genlayer.com`
- Chain ID: `4221`
- Explorer: [explorer-bradbury.genlayer.com](https://explorer-bradbury.genlayer.com)
- Faucet: [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation)

### 2. Run the frontend

```bash
cd frontend
copy .env.example .env     # Windows
# cp .env.example .env     # macOS / Linux
```

Set:

```
VITE_CONTRACT_ADDRESS=0xYourDeployedAddress
VITE_NETWORK=testnetBradbury
```

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Connect a wallet

The app discovers **MetaMask** and **OKX Wallet** through EIP-6963 (with `window.ethereum` / `window.okxwallet` fallbacks). Before every write it calls `client.connect("<network>")` so the wallet is switched to the GenLayer chain.

Get test GEN from the [faucet](https://testnet-faucet.genlayer.foundation).

### 4. Demo path

1. Connect MetaMask or OKX.
2. **Post a bond** → use the live official scanner to pick a real ongoing FDA recall (or list a 2019 Honda Accord for NHTSA).
3. Lock a small GEN bond.
4. Open the vault → **File a claim** with a lot/serial and any public `https://` proof URL.
5. Open the claim → **Adjudicate from official data**.
6. Watch the lifecycle: `PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED`.
7. Read the stored agency, recall number, and reasoning. GEN pays out on finalization if the claim is in scope.

## Tests

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix:    source .venv/bin/activate
pip install -r requirements.txt
pytest tests/direct/ -v
```

Direct-mode tests mock FDA/NHTSA HTTP bodies and LLM JSON. They cover listing, funding, reservation, cancel, honor, over-bond revert, duplicate open claims, FDA payout, FDA denial, and NHTSA vehicle payout.

Optional lint:

```bash
genvm-lint check contracts/recall_vault.py
```

## Architecture (what lives where)

| Layer | Responsibility |
|---|---|
| Frontend | Wallet connect, forms, live FDA/NHTSA preview, transaction lifecycle UI |
| Intelligent Contract | Bond accounting, official URL construction, fetch + judgment, payout |
| GenLayer validators | Independent re-fetch and equivalence on decision fields |

If the frontend computed “this lot is recalled” and only stored the answer, GenLayer would add no trust. That is deliberately not how this app is built.

## Why this can keep being used

- A manufacturer can keep a standing bond per SKU.
- An insurer can top up the same vault.
- New official recalls keep arriving at the same government APIs — no contract rewrite.
- Consumer groups can fund bonds for products the manufacturer will not cover.

This is an evidence-based settlement workflow, not a court and not legal advice.

## License

MIT
