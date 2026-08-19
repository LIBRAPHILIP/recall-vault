# Deploy RecallVault

## Studio (recommended for first deploy)

1. Open https://studio.genlayer.com
2. Create a new Intelligent Contract.
3. Paste `../contracts/recall_vault.py`.
4. Deploy with no constructor arguments.
5. Copy the address into `frontend/.env` as `VITE_CONTRACT_ADDRESS`.
6. Set `VITE_NETWORK=studionet` if you stay on Studio, or redeploy to Bradbury for a persistent public demo.

## CLI

```bash
npm install -g genlayer
cd ..
genlayer network
genlayer deploy --contract contracts/recall_vault.py
```

## Networks

| Name | RPC | Chain ID | Env value |
|---|---|---|---|
| Testnet Bradbury | https://rpc-bradbury.genlayer.com | 4221 | `testnetBradbury` |
| Testnet Asimov | https://rpc-asimov.genlayer.com | 4221 | `testnetAsimov` |
| Studionet | https://studio.genlayer.com/api | 61999 | `studionet` |
| Localnet | http://localhost:4000/api | 61127 | `localnet` |

Faucet: https://testnet-faucet.genlayer.foundation

After deploy, the frontend must call writes through `genlayer-js` with `client.connect("<network>")` so MetaMask / OKX Wallet are on the matching chain. That is already implemented in `frontend/src/lib/genlayer.ts`.
