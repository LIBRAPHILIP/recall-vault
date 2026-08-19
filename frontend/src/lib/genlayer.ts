import { createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import { asBool, asStr } from "./format";

export const NETWORK_NAME = (import.meta.env.VITE_NETWORK || "testnetBradbury") as NetworkName;
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export type NetworkName = "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";

export const CHAINS = {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} as const;

export const NETWORK_META: Record<
  NetworkName,
  { label: string; chainId: number; rpc: string; explorer: string; faucet?: string }
> = {
  localnet: { label: "Localnet", chainId: 61127, rpc: "http://localhost:4000/api", explorer: "http://localhost:8080" },
  studionet: {
    label: "Studionet",
    chainId: 61999,
    rpc: "https://studio.genlayer.com/api",
    explorer: "https://explorer-studio.genlayer.com",
  },
  testnetAsimov: {
    label: "Testnet Asimov",
    chainId: 4221,
    rpc: "https://rpc-asimov.genlayer.com",
    explorer: "https://explorer-asimov.genlayer.com",
    faucet: "https://testnet-faucet.genlayer.foundation",
  },
  testnetBradbury: {
    label: "Testnet Bradbury",
    chainId: 4221,
    rpc: "https://rpc-bradbury.genlayer.com",
    explorer: "https://explorer-bradbury.genlayer.com",
    faucet: "https://testnet-faucet.genlayer.foundation",
  },
};

export const TX_STAGES = [
  "PENDING",
  "PROPOSING",
  "COMMITTING",
  "REVEALING",
  "ACCEPTED",
  "FINALIZED",
] as const;

export type TxStage = (typeof TX_STAGES)[number] | "UNDETERMINED" | "CANCELED" | "FAILED" | "IDLE";

export type Vault = {
  id: string;
  sponsor: string;
  brand: string;
  name: string;
  category: string;
  search_query: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: string;
  notes: string;
  bond_wei: string;
  reserved_wei: string;
  available_wei: string;
  created_at: string;
  active: boolean;
};

export type Claim = {
  id: string;
  product_id: string;
  claimant: string;
  lot_or_serial: string;
  proof_url: string;
  statement: string;
  amount_wei: string;
  status: string;
  filed_at: string;
  resolved_at: string;
  adjudicator: string;
  agency: string;
  recall_number: string;
  matched_product: string;
  reason_for_recall: string;
  classification: string;
  reasoning: string;
  payout_wei: string;
};

export type Protocol = {
  name: string;
  owner: string;
  vault_count: number;
  claim_count: number;
  open_claim_count: number;
  total_bond_wei: string;
};

export type ReceiptSnapshot = {
  hash: string;
  status: string;
  execution?: string;
  error?: string;
};

function chainOf(name: NetworkName) {
  return CHAINS[name] ?? testnetBradbury;
}

export function createReadClient() {
  return createClient({ chain: chainOf(NETWORK_NAME) });
}

export function createWriteClient(address: `0x${string}`, provider: Eip1193Provider) {
  return createClient({
    chain: chainOf(NETWORK_NAME),
    account: address,
    provider,
  });
}

export async function connectNetwork(client: ReturnType<typeof createWriteClient>) {
  await client.connect(NETWORK_NAME);
}

function mapVault(raw: Record<string, unknown>): Vault {
  return {
    id: asStr(raw.id),
    sponsor: asStr(raw.sponsor),
    brand: asStr(raw.brand),
    name: asStr(raw.name),
    category: asStr(raw.category),
    search_query: asStr(raw.search_query),
    vehicle_make: asStr(raw.vehicle_make),
    vehicle_model: asStr(raw.vehicle_model),
    vehicle_year: asStr(raw.vehicle_year),
    notes: asStr(raw.notes),
    bond_wei: asStr(raw.bond_wei),
    reserved_wei: asStr(raw.reserved_wei),
    available_wei: asStr(raw.available_wei),
    created_at: asStr(raw.created_at),
    active: asBool(raw.active),
  };
}

function mapClaim(raw: Record<string, unknown>): Claim {
  return {
    id: asStr(raw.id),
    product_id: asStr(raw.product_id),
    claimant: asStr(raw.claimant),
    lot_or_serial: asStr(raw.lot_or_serial),
    proof_url: asStr(raw.proof_url),
    statement: asStr(raw.statement),
    amount_wei: asStr(raw.amount_wei),
    status: asStr(raw.status),
    filed_at: asStr(raw.filed_at),
    resolved_at: asStr(raw.resolved_at),
    adjudicator: asStr(raw.adjudicator),
    agency: asStr(raw.agency),
    recall_number: asStr(raw.recall_number),
    matched_product: asStr(raw.matched_product),
    reason_for_recall: asStr(raw.reason_for_recall),
    classification: asStr(raw.classification),
    reasoning: asStr(raw.reasoning),
    payout_wei: asStr(raw.payout_wei),
  };
}

function asRecordMap(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, Record<string, unknown>>;
}

export async function readProtocol(client = createReadClient()): Promise<Protocol> {
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_protocol",
    args: [],
  })) as Record<string, unknown>;
  return {
    name: asStr(raw.name) || "RecallVault",
    owner: asStr(raw.owner),
    vault_count: Number(asStr(raw.vault_count) || 0),
    claim_count: Number(asStr(raw.claim_count) || 0),
    open_claim_count: Number(asStr(raw.open_claim_count) || 0),
    total_bond_wei: asStr(raw.total_bond_wei),
  };
}

export async function readVaults(client = createReadClient()): Promise<Vault[]> {
  const raw = asRecordMap(
    await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_vaults",
      args: [],
    })
  );
  return Object.values(raw).map(mapVault).sort((a, b) => Number(b.id) - Number(a.id));
}

export async function readVault(id: string, client = createReadClient()): Promise<Vault> {
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_vault",
    args: [id],
  })) as Record<string, unknown>;
  return mapVault(raw);
}

export async function readClaims(client = createReadClient()): Promise<Claim[]> {
  const raw = asRecordMap(
    await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_claims",
      args: [],
    })
  );
  return Object.values(raw).map(mapClaim).sort((a, b) => Number(b.id) - Number(a.id));
}

export async function readClaimsForProduct(id: string, client = createReadClient()): Promise<Claim[]> {
  const raw = asRecordMap(
    await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_claims_for_product",
      args: [id],
    })
  );
  return Object.values(raw).map(mapClaim).sort((a, b) => Number(b.id) - Number(a.id));
}

export async function readClaim(id: string, client = createReadClient()): Promise<Claim> {
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_claim",
    args: [id],
  })) as Record<string, unknown>;
  return mapClaim(raw);
}

export async function readSources(
  category: string,
  searchQuery: string,
  make: string,
  model: string,
  year: string,
  client = createReadClient()
): Promise<string[]> {
  const raw = (await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "preview_sources",
    args: [category, searchQuery, make, model, year],
  })) as { urls?: unknown };
  if (Array.isArray(raw?.urls)) return raw.urls.map(asStr);
  return [];
}

export type WriteParams = {
  functionName: string;
  args: Array<string | number | bigint | boolean>;
  value?: bigint;
};

function pickStatus(tx: Record<string, unknown>): string {
  const candidates = [
    tx.statusName,
    tx.status,
    tx.txStatus,
    tx.current_status,
    tx.consensus_status,
    (tx.tx as Record<string, unknown> | undefined)?.status,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const text = String(c).trim();
    if (!text || /^\d+$/.test(text)) continue;
    return text.toUpperCase();
  }
  return "";
}

export async function sendAndTrack(
  writeClient: ReturnType<typeof createWriteClient>,
  readClient: ReturnType<typeof createReadClient>,
  params: WriteParams,
  onUpdate: (snap: ReceiptSnapshot) => void
): Promise<ReceiptSnapshot> {
  await connectNetwork(writeClient);
  const hash = (await writeClient.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: params.functionName,
    args: params.args,
    value: params.value ?? 0n,
  })) as `0x${string}` & { length: 66 };

  let snap: ReceiptSnapshot = { hash, status: "PENDING" };
  onUpdate(snap);

  let stopped = false;
  const poll = window.setInterval(async () => {
    if (stopped) return;
    try {
      const tx = (await readClient.getTransaction({ hash: hash as `0x${string}` & { length: 66 } })) as Record<
        string,
        unknown
      >;
      const status = pickStatus(tx);
      if (status && status !== snap.status) {
        snap = { ...snap, status };
        onUpdate(snap);
      }
    } catch {
      /* still pending / RPC lag */
    }
  }, 2500);

  try {
    const receipt = (await readClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      interval: 4000,
      retries: 90,
    })) as Record<string, unknown>;

    const exec = asStr(receipt.txExecutionResultName || receipt.execution_result);
    const statusName = pickStatus(receipt) || "FINALIZED";
    const failed =
      exec === ExecutionResult.FINISHED_WITH_ERROR ||
      statusName === "UNDETERMINED" ||
      statusName === "CANCELED" ||
      statusName === "VALIDATORS_TIMEOUT" ||
      statusName === "LEADER_TIMEOUT";
    const leader = receipt.consensus_data as { leader_receipt?: Array<{ error?: string }> } | undefined;
    const leaderError = leader?.leader_receipt?.[0]?.error || "";

    snap = {
      hash,
      status: failed ? statusName || "FAILED" : "FINALIZED",
      execution: exec,
      error: failed
        ? asStr(leaderError || receipt.txExecutionError || receipt.error || "Execution did not finish cleanly")
        : "",
    };
    onUpdate(snap);
    return snap;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    snap = { ...snap, status: "FAILED", error: message };
    onUpdate(snap);
    throw err;
  } finally {
    stopped = true;
    window.clearInterval(poll);
  }
}

export function isConfigured(): boolean {
  return Boolean(CONTRACT_ADDRESS) && !CONTRACT_ADDRESS.endsWith("0000000000000000");
}

export { TransactionStatus, ExecutionResult };
