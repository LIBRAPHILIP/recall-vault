/**
 * Deploy RecallVault with genlayer-js.
 *
 *   node deploy/deploy.mjs bradbury
 *   node deploy/deploy.mjs studionet
 *   PRIVATE_KEY=0x… node deploy/deploy.mjs bradbury
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient, createAccount } from "genlayer-js";
import { studionet, testnetBradbury, localnet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const NETWORKS = {
  studionet,
  bradbury: testnetBradbury,
  testnetbradbury: testnetBradbury,
  localnet,
};

function pickAddress(receipt) {
  return (
    receipt?.data?.contract_address ||
    receipt?.to_address ||
    receipt?.txDataDecoded?.contractAddress ||
    receipt?.contractAddress ||
    receipt?.data?.contractAddress ||
    null
  );
}

async function main() {
  const netName = (process.argv[2] || "bradbury").toLowerCase();
  const chain = NETWORKS[netName];
  if (!chain) {
    console.error("Use: bradbury | studionet | localnet");
    process.exit(1);
  }

  let account;
  const pk = process.env.PRIVATE_KEY || process.env.GENLAYER_PRIVATE_KEY;
  if (pk) {
    const { privateKeyToAccount: pka } = await import("viem/accounts");
    account = pka(pk.startsWith("0x") ? pk : `0x${pk}`);
    console.log("Account:", account.address);
  } else {
    account = createAccount();
    console.log("Ephemeral account:", account.address);
  }

  const client = createClient({ chain, account });
  if (typeof client.initializeConsensusSmartContract === "function") {
    await client.initializeConsensusSmartContract();
  }

  try {
    const bal = await client.getBalance({ address: account.address });
    console.log("Balance:", bal?.toString?.() ?? bal);
  } catch (err) {
    console.log("Balance check skipped:", err.message);
  }

  const code = new Uint8Array(readFileSync(path.join(root, "contracts/recall_vault.py")));
  console.log(`Deploying RecallVault → ${chain.name || netName} (id ${chain.id})…`);
  const txHash = await client.deployContract({ code, args: [] });
  console.log("Deploy tx:", txHash);

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.ACCEPTED,
    retries: 400,
    interval: 4000,
  });

  const address = pickAddress(receipt);
  console.log("Status:", receipt.statusName || receipt.status);
  console.log("Execution:", receipt.txExecutionResultName || receipt.result_name || receipt.result);
  if (!address) {
    console.error(JSON.stringify(receipt, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    throw new Error("Could not resolve contract address");
  }

  const payload = {
    contract: "RecallVault",
    address,
    chainId: chain.id,
    network: netName,
    deployTx: txHash,
    deployedAt: new Date().toISOString(),
    deployer: account.address,
  };

  mkdirSync(path.join(root, "deployments"), { recursive: true });
  writeFileSync(
    path.join(root, "deployments", `recall-vault-${chain.id}.json`),
    JSON.stringify(payload, null, 2)
  );
  console.log("\nRecallVault live at", address);
  console.log("Wrote deployments/recall-vault-" + chain.id + ".json");
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
