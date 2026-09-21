import { useCallback, useEffect, useMemo, useState } from "react";
import { TxLifecycle } from "./components/TxLifecycle";
import {
  CONTRACT_ADDRESS,
  NETWORK_META,
  NETWORK_NAME,
  createReadClient,
  createWriteClient,
  isConfigured,
  readClaim,
  readClaims,
  readClaimsForProduct,
  readProtocol,
  readProofToken,
  readSources,
  readVault,
  readVaults,
  sendAndTrack,
  type Claim,
  type Protocol,
  type ReceiptSnapshot,
  type Vault,
} from "./lib/genlayer";
import { latestFdaFood, scanFda, scanNhtsa, type OfficialHit } from "./lib/official";
import {
  explorerAddr,
  faucetUrl,
  formatGen,
  parseWei,
  sameAddr,
  shortAddr,
  timeAgo,
} from "./lib/format";
import { discoverWallets, listenWallet, requestAccounts, type DiscoveredWallet } from "./lib/wallet";

type View =
  | { name: "home" }
  | { name: "vaults" }
  | { name: "new-vault" }
  | { name: "vault"; id: string }
  | { name: "claim"; id: string }
  | { name: "how" };

const CATEGORIES = ["food", "drug", "device", "vehicle", "consumer"] as const;

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 28h36v22H14z" fill="#1b212c" stroke="#ff6b1a" strokeWidth="3" />
      <path d="M22 28v-6a10 10 0 0 1 20 0v6" fill="none" stroke="#ff6b1a" strokeWidth="3" />
      <circle cx="32" cy="39" r="4" fill="#ff6b1a" />
    </svg>
  );
}

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [picker, setPicker] = useState(false);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [walletName, setWalletName] = useState("");
  const [account, setAccount] = useState("");
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tx, setTx] = useState<ReceiptSnapshot | null>(null);

  const readClient = useMemo(() => createReadClient(), []);
  const writeClient = useMemo(() => {
    if (!account || !provider) return null;
    return createWriteClient(account as `0x${string}`, provider);
  }, [account, provider]);

  const refresh = useCallback(async () => {
    if (!isConfigured()) return;
    setLoading(true);
    setError("");
    try {
      const [p, v, c] = await Promise.all([
        readProtocol(readClient),
        readVaults(readClient),
        readClaims(readClient),
      ]);
      setProtocol(p);
      setVaults(v);
      setClaims(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [readClient]);

  useEffect(() => {
    void discoverWallets().then(setWallets);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!provider) return;
    return listenWallet(provider, {
      onAccounts: (accs) => setAccount(accs[0] || ""),
      onChain: () => undefined,
    });
  }, [provider]);

  async function connect(wallet: DiscoveredWallet) {
    setPicker(false);
    const addr = await requestAccounts(wallet.provider);
    setProvider(wallet.provider);
    setWalletName(wallet.name);
    setAccount(addr);
  }

  async function runWrite(
    functionName: string,
    args: Array<string | number | bigint | boolean>,
    value = 0n,
    payout = false
  ) {
    if (!writeClient) {
      setPicker(true);
      throw new Error("Connect MetaMask or OKX Wallet first");
    }
    setError("");
    const snap = await sendAndTrack(writeClient, readClient, { functionName, args, value, payout }, setTx);
    await refresh();
    return snap;
  }

  const net = NETWORK_META[NETWORK_NAME];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={() => setView({ name: "home" })}>
          <div className="brand-mark">
            <Logo />
          </div>
          <div>
            <h1>RecallVault</h1>
            <p>Official-data recall bonds</p>
          </div>
        </div>
        <nav className="nav">
          <button className={view.name === "home" ? "active" : ""} onClick={() => setView({ name: "home" })}>
            Brief
          </button>
          <button className={view.name === "vaults" || view.name === "vault" ? "active" : ""} onClick={() => setView({ name: "vaults" })}>
            Vaults
          </button>
          <button className={view.name === "new-vault" ? "active" : ""} onClick={() => setView({ name: "new-vault" })}>
            Post a bond
          </button>
          <button className={view.name === "how" ? "active" : ""} onClick={() => setView({ name: "how" })}>
            How it works
          </button>
        </nav>
        <div className="wallet-box">
          <span className="pill ok">{net.label}</span>
          {account ? (
            <>
              <span className="pill">{walletName || "Wallet"}</span>
              <a className="pill" href={explorerAddr(account, NETWORK_NAME)} target="_blank" rel="noreferrer">
                {shortAddr(account)}
              </a>
            </>
          ) : (
            <button className="btn-primary" onClick={() => setPicker(true)}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {!isConfigured() ? (
        <div className="notice error mt">
          No contract address configured. Deploy <span className="mono">contracts/recall_vault.py</span> then set{" "}
          <span className="mono">VITE_CONTRACT_ADDRESS</span> in <span className="mono">frontend/.env</span>.
        </div>
      ) : null}
      {error ? <div className="notice error mt">{error}</div> : null}
      {tx ? (
        <div className="mt">
          <TxLifecycle snap={tx} />
        </div>
      ) : null}

      {view.name === "home" ? (
        <Home
          protocol={protocol}
          vaults={vaults}
          claims={claims}
          loading={loading}
          onVaults={() => setView({ name: "vaults" })}
          onNew={() => setView({ name: "new-vault" })}
          onVault={(id) => setView({ name: "vault", id })}
          onClaim={(id) => setView({ name: "claim", id })}
        />
      ) : null}
      {view.name === "vaults" ? (
        <VaultList vaults={vaults} loading={loading} onOpen={(id) => setView({ name: "vault", id })} />
      ) : null}
      {view.name === "new-vault" ? (
        <NewVault
          account={account}
          onNeedWallet={() => setPicker(true)}
          onSubmit={async (payload, value) => {
            await runWrite(
              "list_product",
              [
                payload.brand,
                payload.name,
                payload.category,
                payload.search_query,
                payload.vehicle_make,
                payload.vehicle_model,
                payload.vehicle_year,
                payload.notes,
                payload.compensation_wei,
                payload.claim_stake_wei,
                payload.claim_ttl_sec,
                payload.max_open_claims,
              ],
              value
            );
            setView({ name: "vaults" });
          }}
        />
      ) : null}
      {view.name === "vault" ? (
        <VaultDetail
          id={view.id}
          account={account}
          readClient={readClient}
          onNeedWallet={() => setPicker(true)}
          onClaim={(id) => setView({ name: "claim", id })}
          onWrite={runWrite}
        />
      ) : null}
      {view.name === "claim" ? (
        <ClaimDetail
          id={view.id}
          account={account}
          vaults={vaults}
          readClient={readClient}
          onNeedWallet={() => setPicker(true)}
          onVault={(id) => setView({ name: "vault", id })}
          onWrite={runWrite}
        />
      ) : null}
      {view.name === "how" ? <How /> : null}

      {picker ? (
        <div className="modal-back" onClick={() => setPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Connect a wallet</h3>
            <p className="hint">MetaMask and OKX Wallet are supported via EIP-1193 / EIP-6963. The app will switch you to {net.label} (chain {net.chainId}) before any write.</p>
            {wallets.length === 0 ? (
              <div className="notice mt">
                No injected wallet found. Install{" "}
                <a href="https://metamask.io" target="_blank" rel="noreferrer">
                  MetaMask
                </a>{" "}
                or{" "}
                <a href="https://www.okx.com/web3" target="_blank" rel="noreferrer">
                  OKX Wallet
                </a>
                .
              </div>
            ) : (
              wallets.map((w) => (
                <button key={w.id} className="wallet-choice" onClick={() => void connect(w)}>
                  {w.icon ? <img src={w.icon} alt="" /> : <Logo />}
                  <span>
                    <strong>{w.name}</strong>
                    <div className="small muted">{w.kind === "okx" ? "OKX Wallet" : w.kind === "metamask" ? "MetaMask" : "Injected"}</div>
                  </span>
                </button>
              ))
            )}
            <p className="hint mt">
              Need test GEN?{" "}
              <a href={faucetUrl()} target="_blank" rel="noreferrer">
                {NETWORK_NAME === "studionet" ? "Open GenLayer Studio and use the faucet" : "Open the GenLayer testnet faucet"}
              </a>
              . Writes call <span className="mono">client.connect("{NETWORK_NAME}")</span> then{" "}
              <span className="mono">writeContract</span>.
            </p>
            <button className="ghost mt" onClick={() => setPicker(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <footer className="mt muted small">
        Intelligent Contract{" "}
        <a href={explorerAddr(CONTRACT_ADDRESS, NETWORK_NAME)} target="_blank" rel="noreferrer">
          {shortAddr(CONTRACT_ADDRESS)}
        </a>{" "}
        · {net.label} · {net.rpc} · payouts settle on GenLayer, not on a backend LLM
      </footer>
    </div>
  );
}

function Home({
  protocol,
  vaults,
  claims,
  loading,
  onVaults,
  onNew,
  onVault,
  onClaim,
}: {
  protocol: Protocol | null;
  vaults: Vault[];
  claims: Claim[];
  loading: boolean;
  onVaults: () => void;
  onNew: () => void;
  onVault: (id: string) => void;
  onClaim: (id: string) => void;
}) {
  return (
    <>
      <section className="hero">
        <div>
          <div className="stamp open mb">Consumer protection primitive</div>
          <h2>
            When a product is recalled, <em>the manufacturer no longer decides</em> who gets paid.
          </h2>
          <p className="lede">
            RecallVault locks a GEN bond against a product. Anyone can file a claim. A GenLayer Intelligent
            Contract fetches live FDA, NHTSA, or CPSC records, judges whether that specific lot or vehicle is
            in scope, and pays from the bond — or rejects the claim. The decision is consensus, not a company
            helpdesk.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={onNew}>
              Post a recall bond
            </button>
            <button className="btn" onClick={onVaults}>
              Browse vaults
            </button>
          </div>
          <p className="hint mt">
            Live contract{" "}
            <a href={explorerAddr(CONTRACT_ADDRESS, NETWORK_NAME)} target="_blank" rel="noreferrer" className="mono">
              {shortAddr(CONTRACT_ADDRESS)}
            </a>{" "}
            on {NETWORK_META[NETWORK_NAME].label}. Vault counts below are <span className="mono">readContract</span>{" "}
            results, not a cached backend.
          </p>
        </div>
        <div className="panel">
          <h3>Why this is a trust problem</h3>
          <p className="hint">
            Official recall databases already exist. Payouts do not. Consumers wait on the same company that
            shipped the defect. Oracles cannot read recall language. A normal smart contract cannot tell
            whether lot 4450 is inside “lots 4411 through 4488.”
          </p>
          <div className="steps mt">
            <div className="step">
              <div className="num">1</div>
              <div>
                <strong>Bond</strong>
                <div className="hint">Sponsor lists a product and locks GEN.</div>
              </div>
            </div>
            <div className="step">
              <div className="num">2</div>
              <div>
                <strong>Claim</strong>
                <div className="hint">Owner files lot/serial plus a public proof URL.</div>
              </div>
            </div>
            <div className="step">
              <div className="num">3</div>
              <div>
                <strong>Adjudicate</strong>
                <div className="hint">Validators independently fetch government APIs and agree on coverage.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <span>Vaults</span>
          <strong>{protocol?.vault_count ?? (loading ? "…" : 0)}</strong>
        </div>
        <div className="stat">
          <span>Open claims</span>
          <strong>{protocol?.open_claim_count ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Bond locked</span>
          <strong>{formatGen(protocol?.total_bond_wei || "0")} GEN</strong>
        </div>
        <div className="stat">
          <span>Network</span>
          <strong style={{ fontSize: 14 }}>{NETWORK_META[NETWORK_NAME].label}</strong>
        </div>
      </section>

      <section className="grid-2">
        <div>
          <div className="row mb">
            <h3>Active vaults</h3>
            <button className="ghost" onClick={onVaults}>
              All vaults
            </button>
          </div>
          {vaults.length === 0 ? (
            <div className="empty">{loading ? "Reading contract…" : "No vaults yet. Post the first bond."}</div>
          ) : (
            <div className="cards">
              {vaults.slice(0, 4).map((v) => (
                <VaultCard key={v.id} vault={v} onClick={() => onVault(v.id)} />
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <h3>Recent claims</h3>
          {claims.length === 0 ? (
            <p className="hint">No claims filed yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {claims.slice(0, 8).map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => onClaim(c.id)}>
                    <td className="mono">#{c.id}</td>
                    <td>
                      <span className={`stamp ${c.status}`}>{c.status}</span>
                    </td>
                    <td className="mono">{formatGen(c.amount_wei)} GEN</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

function VaultCard({ vault, onClick }: { vault: Vault; onClick: () => void }) {
  return (
    <article className="card" onClick={onClick}>
      <div className="row">
        <span className={`stamp ${vault.category}`}>{vault.category}</span>
        <span className="small muted">#{vault.id}</span>
      </div>
      <h3 style={{ margin: "10px 0 4px" }}>
        {vault.brand} {vault.name}
      </h3>
      <div className="meta">
        Available {formatGen(vault.available_wei)} GEN · reserved {formatGen(vault.reserved_wei)}
      </div>
      <div className="bond">{formatGen(vault.bond_wei)} GEN bonded</div>
      {vault.compensation_wei ? (
        <div className="meta">Fixed payout {formatGen(vault.compensation_wei)} GEN · stake {formatGen(vault.claim_stake_wei)}</div>
      ) : null}
    </article>
  );
}

function VaultList({
  vaults,
  loading,
  onOpen,
}: {
  vaults: Vault[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="mt">
      <h2>Recall bonds</h2>
      <p className="lede">Each vault is a product-backed GEN bond. Claims reserve funds until adjudication or honor.</p>
      {vaults.length === 0 ? (
        <div className="empty mt">{loading ? "Reading vaults from the contract…" : "No products listed yet."}</div>
      ) : (
        <div className="cards mt">
          {vaults.map((v) => (
            <VaultCard key={v.id} vault={v} onClick={() => onOpen(v.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function NewVault({
  account,
  onNeedWallet,
  onSubmit,
}: {
  account: string;
  onNeedWallet: () => void;
  onSubmit: (
    payload: {
      brand: string;
      name: string;
      category: string;
      search_query: string;
      vehicle_make: string;
      vehicle_model: string;
      vehicle_year: string;
      notes: string;
      compensation_wei: string;
      claim_stake_wei: string;
      claim_ttl_sec: string;
      max_open_claims: string;
    },
    value: bigint
  ) => Promise<void>;
}) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("food");
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");
  const [bond, setBond] = useState("20");
  const [compensation, setCompensation] = useState("4");
  const [stake, setStake] = useState("1");
  const [ttlHours, setTtlHours] = useState("72");
  const [maxOpen, setMaxOpen] = useState("3");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<OfficialHit[]>([]);
  const [scanErr, setScanErr] = useState("");
  const [urls, setUrls] = useState<string[]>([]);

  async function scan() {
    setScanErr("");
    try {
      if (category === "vehicle") {
        setHits(await scanNhtsa(make || brand, model || name, year));
      } else if (category === "food" || category === "drug" || category === "device") {
        setHits(await scanFda(category, query || name || brand));
      } else {
        setHits(await latestFdaFood());
      }
    } catch (err) {
      setScanErr(err instanceof Error ? err.message : String(err));
    }
  }

  async function preview() {
    try {
      setUrls(await readSources(category, query || name, make, model, year));
    } catch {
      setUrls([]);
    }
  }

  return (
    <section className="grid-2 mt">
      <div className="panel">
        <h3>List a product and post a bond</h3>
        <p className="hint">
          You define a <strong>fixed compensation</strong> per approved claim. The LLM only decides
          eligibility. Claimants cannot choose how much to draw. Vehicle vaults pay for{" "}
          <strong>model-year campaign coverage after VIN decode</strong>, not an unrepaired-VIN manufacturer list.
        </p>
        <form
          className="form mt"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!account) {
              onNeedWallet();
              return;
            }
            setBusy(true);
            try {
              await onSubmit(
                {
                  brand,
                  name,
                  category,
                  search_query: query || name || brand,
                  vehicle_make: make,
                  vehicle_model: model,
                  vehicle_year: year,
                  notes,
                  compensation_wei: parseWei(compensation).toString(),
                  claim_stake_wei: parseWei(stake).toString(),
                  claim_ttl_sec: String(Math.max(1, Number(ttlHours) || 72) * 3600),
                  max_open_claims: maxOpen,
                },
                parseWei(bond)
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-row">
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Initial bond (GEN)
              <input value={bond} onChange={(e) => setBond(e.target.value)} />
            </label>
          </div>
          <div className="form-row three">
            <label>
              Fixed payout / claim
              <input value={compensation} onChange={(e) => setCompensation(e.target.value)} />
            </label>
            <label>
              Claim stake
              <input value={stake} onChange={(e) => setStake(e.target.value)} />
            </label>
            <label>
              Claim TTL (hours)
              <input value={ttlHours} onChange={(e) => setTtlHours(e.target.value)} />
            </label>
          </div>
          <label>
            Max open claims
            <input value={maxOpen} onChange={(e) => setMaxOpen(e.target.value)} />
          </label>
          <div className="form-row">
            <label>
              Brand / firm
              <input value={brand} onChange={(e) => setBrand(e.target.value)} required />
            </label>
            <label>
              Product name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          </div>
          <label>
            Official search query
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Keywords the FDA/CPSC APIs should search"
            />
          </label>
          {category === "vehicle" ? (
            <div className="form-row three">
              <label>
                Make
                <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="honda" />
              </label>
              <label>
                Model
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="accord" />
              </label>
              <label>
                Year
                <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2019" />
              </label>
            </div>
          ) : null}
          <label>
            Notes for adjudicators
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope of this bond, covered SKUs, exclusions" />
          </label>
          <div className="split">
            <button className="btn-primary" disabled={busy} type="submit">
              {busy ? "Waiting for wallet / consensus…" : "List product & lock bond"}
            </button>
            <button className="btn" type="button" onClick={() => void preview()}>
              Show official URLs
            </button>
          </div>
        </form>
        {urls.length ? (
          <div className="notice mt">
            The contract will fetch:
            {urls.map((u) => (
              <div key={u} className="mono small mt">
                {u}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <div className="panel">
          <h3>Live official scanner</h3>
          <p className="hint">
            This preview talks to openFDA / NHTSA from your browser so you can list a product that actually
            has public recall records. It is UX only. Settlement still happens inside the Intelligent Contract.
          </p>
          <button className="btn mt" onClick={() => void scan()}>
            Scan official databases
          </button>
          {scanErr ? <div className="notice error mt">{scanErr}</div> : null}
          {hits.map((h) => (
            <div className="hit" key={`${h.agency}-${h.recall_number}-${h.title.slice(0, 16)}`}>
              <span className="stamp open">
                {h.agency} {h.recall_number}
              </span>
              <strong className="mt">{h.title.slice(0, 180)}</strong>
              <p>{h.reason.slice(0, 280)}</p>
              <p>{h.extra}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VaultDetail({
  id,
  account,
  readClient,
  onNeedWallet,
  onClaim,
  onWrite,
}: {
  id: string;
  account: string;
  readClient: ReturnType<typeof createReadClient>;
  onNeedWallet: () => void;
  onClaim: (id: string) => void;
  onWrite: (
    fn: string,
    args: Array<string | number | bigint | boolean>,
    value?: bigint,
    payout?: boolean
  ) => Promise<ReceiptSnapshot>;
}) {
  const [vault, setVault] = useState<Vault | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [lot, setLot] = useState("");
  const [proof, setProof] = useState("https://");
  const [statement, setStatement] = useState("");
  const [token, setToken] = useState("");
  const [fund, setFund] = useState("1");
  const [withdraw, setWithdraw] = useState("1");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [v, c] = await Promise.all([readVault(id, readClient), readClaimsForProduct(id, readClient)]);
    setVault(v);
    setClaims(c);
  }, [id, readClient]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!vault) return <div className="empty mt">Loading vault #{id}…</div>;
  const isSponsor = sameAddr(account, vault.sponsor);

  async function wrap(label: string, fn: () => Promise<unknown>) {
    if (!account) {
      onNeedWallet();
      return;
    }
    setBusy(label);
    try {
      await fn();
      await load();
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt">
      <div className="row">
        <div>
          <span className={`stamp ${vault.category}`}>{vault.category}</span>
          <h2 style={{ margin: "8px 0 4px" }}>
            {vault.brand} {vault.name}
          </h2>
          <div className="muted">
            Sponsor {shortAddr(vault.sponsor)} · listed {timeAgo(vault.created_at)} · {vault.active ? "active" : "inactive"}
          </div>
        </div>
        <div className="stat">
          <span>Available</span>
          <strong>{formatGen(vault.available_wei)} GEN</strong>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Bond</span>
          <strong>{formatGen(vault.bond_wei)}</strong>
        </div>
        <div className="stat">
          <span>Reserved</span>
          <strong>{formatGen(vault.reserved_wei)}</strong>
        </div>
        <div className="stat">
          <span>Fixed payout</span>
          <strong>{formatGen(vault.compensation_wei)}</strong>
        </div>
        <div className="stat">
          <span>Claim stake / TTL</span>
          <strong style={{ fontSize: 13 }}>
            {formatGen(vault.claim_stake_wei)} GEN · {Math.round(Number(vault.claim_ttl_sec || 0) / 3600)}h · max {vault.max_open_claims || "—"} open
          </strong>
        </div>
      </div>
      {vault.category === "vehicle" ? (
        <div className="notice mt">
          Vehicle vaults pay for <strong>model-year campaign coverage</strong> after NHTSA vPIC decodes the VIN
          to this make/model/year. That is not NHTSA’s unrepaired-VIN owner list.
        </div>
      ) : null}

      <div className="grid-2">
        <div className="panel">
          <h3>File a claim</h3>
          <p className="hint">
            Public-commit bearer entitlement: publish the token below on an https purchase/ownership page,
            then file. The token is <strong>self-published bearer evidence</strong>, not verified ownership
            of a receipt. Official recall scope is judged from government records only — the proof page is
            not sent to that LLM. Filing reserves {formatGen(vault.compensation_wei)} GEN and requires a{" "}
            {formatGen(vault.claim_stake_wei)} GEN stake. Cancel slashes a penalty into the bond and starts a
            refile cooldown.
          </p>
          <form
            className="form mt"
            onSubmit={(e) => {
              e.preventDefault();
              void wrap("file", () =>
                onWrite("file_claim", [vault.id, lot, proof, statement], BigInt(vault.claim_stake_wei || "0"))
              );
            }}
          >
            <label>
              {vault.category === "vehicle" ? "17-character VIN" : "Lot / serial"}
              <input value={lot} onChange={(e) => setLot(e.target.value)} required />
            </label>
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (!account) {
                  onNeedWallet();
                  return;
                }
                void readProofToken(vault.id, lot, account, readClient).then(setToken);
              }}
            >
              Show commit token
            </button>
            {token ? (
              <div className="notice">
                Publish this exact line on the proof page:
                <div className="mono small mt">{token}</div>
              </div>
            ) : null}
            <label>
              Public https proof URL
              <input value={proof} onChange={(e) => setProof(e.target.value)} required />
            </label>
            <label>
              Statement
              <textarea value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Where and when you obtained the product" />
            </label>
            <button className="btn-primary" disabled={!!busy}>
              {busy === "file" ? "Filing…" : `File claim (stake ${formatGen(vault.claim_stake_wei)} GEN)`}
            </button>
          </form>
        </div>
        <div>
          <div className="panel">
            <h3>Fund this bond</h3>
            <p className="hint">Anyone can add GEN — manufacturer, insurer, or advocacy group.</p>
            <div className="split mt">
              <input value={fund} onChange={(e) => setFund(e.target.value)} />
              <button
                className="btn-ok"
                disabled={!!busy}
                onClick={() => void wrap("fund", () => onWrite("fund_bond", [vault.id], parseWei(fund)))}
              >
                {busy === "fund" ? "Funding…" : "Add GEN"}
              </button>
            </div>
          </div>
          {isSponsor ? (
            <div className="panel mt">
              <h3>Sponsor controls</h3>
              <div className="split mt">
                <input value={withdraw} onChange={(e) => setWithdraw(e.target.value)} />
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={() =>
                    void wrap("withdraw", () => onWrite("withdraw_surplus", [vault.id, parseWei(withdraw).toString()]))
                  }
                >
                  Withdraw surplus
                </button>
              </div>
              {vault.active ? (
                <button
                  className="btn-danger mt"
                  disabled={!!busy}
                  onClick={() => void wrap("off", () => onWrite("deactivate_product", [vault.id]))}
                >
                  Deactivate listings
                </button>
              ) : null}
            </div>
          ) : null}
          {vault.notes ? (
            <div className="panel mt">
              <h3>Sponsor notes</h3>
              <p className="hint">{vault.notes}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel mt">
        <h3>Claims on this vault</h3>
        {claims.length === 0 ? (
          <p className="hint">No claims yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Lot</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Agency</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => onClaim(c.id)}>
                  <td className="mono">#{c.id}</td>
                  <td>{c.lot_or_serial}</td>
                  <td className="mono">{formatGen(c.amount_wei)}</td>
                  <td>
                    <span className={`stamp ${c.status}`}>{c.status}</span>
                  </td>
                  <td>{c.agency || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ClaimDetail({
  id,
  account,
  vaults,
  readClient,
  onNeedWallet,
  onVault,
  onWrite,
}: {
  id: string;
  account: string;
  vaults: Vault[];
  readClient: ReturnType<typeof createReadClient>;
  onNeedWallet: () => void;
  onVault: (id: string) => void;
  onWrite: (
    fn: string,
    args: Array<string | number | bigint | boolean>,
    value?: bigint,
    payout?: boolean
  ) => Promise<ReceiptSnapshot>;
}) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setClaim(await readClaim(id, readClient));
  }, [id, readClient]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!claim) return <div className="empty mt">Loading claim #{id}…</div>;
  const vault = vaults.find((v) => v.id === claim.product_id);
  const isClaimant = sameAddr(account, claim.claimant);
  const isSponsor = vault ? sameAddr(account, vault.sponsor) : false;

  async function wrap(label: string, fn: string, payout = false) {
    if (!account) {
      onNeedWallet();
      return;
    }
    setBusy(label);
    try {
      await onWrite(fn, [claim!.id], 0n, payout);
      await load();
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="mt grid-2">
      <div className="panel">
        <div className="row">
          <h3>Claim #{claim.id}</h3>
          <span className={`stamp ${claim.status}`}>{claim.status}</span>
        </div>
        <p className="hint">
          Product vault{" "}
          <button className="ghost" onClick={() => onVault(claim.product_id)}>
            #{claim.product_id} {vault ? `${vault.brand} ${vault.name}` : ""}
          </button>
        </p>
        <table className="table">
          <tbody>
            <tr>
              <td className="muted">Claimant</td>
              <td className="mono">{shortAddr(claim.claimant)}</td>
            </tr>
            <tr>
              <td className="muted">Lot / serial</td>
              <td>{claim.lot_or_serial}</td>
            </tr>
            <tr>
              <td className="muted">Amount</td>
              <td className="mono">{formatGen(claim.amount_wei)} GEN</td>
            </tr>
            <tr>
              <td className="muted">Payout</td>
              <td className="mono">{formatGen(claim.payout_wei)} GEN</td>
            </tr>
            <tr>
              <td className="muted">Proof</td>
              <td>
                <a href={claim.proof_url} target="_blank" rel="noreferrer">
                  {claim.proof_url}
                </a>
              </td>
            </tr>
            <tr>
              <td className="muted">Commit token</td>
              <td className="mono small">{claim.proof_token || "—"}</td>
            </tr>
            <tr>
              <td className="muted">Settlement basis</td>
              <td className="mono">{claim.settlement_basis || (claim.status === "open" ? "pending" : "—")}</td>
            </tr>
            <tr>
              <td className="muted">Commit / lot in scope</td>
              <td>
                token {String(claim.entitled)} / {String(claim.lot_in_scope)}
                {claim.vin_matches ? " · VIN matches listing" : ""}
                {claim.status === "honored" ? " · sponsor honor does not set consensus eligibility" : ""}
              </td>
            </tr>
            <tr>
              <td className="muted">Expires</td>
              <td className="mono">{claim.expires_at ? new Date(Number(claim.expires_at) * 1000).toISOString() : "—"}</td>
            </tr>
            <tr>
              <td className="muted">Statement</td>
              <td>{claim.statement || "—"}</td>
            </tr>
            <tr>
              <td className="muted">Filed</td>
              <td>{claim.filed_at || "—"}</td>
            </tr>
            <tr>
              <td className="muted">Resolved</td>
              <td>{claim.resolved_at || "—"}</td>
            </tr>
          </tbody>
        </table>
        {claim.status === "open" ? (
          <div className="split mt">
            <button className="btn-primary" disabled={!!busy} onClick={() => void wrap("adj", "adjudicate", true)}>
              {busy === "adj" ? "Adjudicating against official sources…" : "Adjudicate from official data"}
            </button>
            {isSponsor ? (
              <button className="btn-ok" disabled={!!busy} onClick={() => void wrap("honor", "honor_claim", true)}>
                Honor fixed payout
              </button>
            ) : null}
            {isClaimant ? (
              <button className="btn-danger" disabled={!!busy} onClick={() => void wrap("cancel", "cancel_claim")}>
                Cancel (stake penalty + cooldown)
              </button>
            ) : null}
            <button className="btn" disabled={!!busy} onClick={() => void wrap("exp", "release_expired")}>
              Release if expired
            </button>
          </div>
        ) : null}
        <p className="hint mt">
          Adjudication is the main GenLayer workflow. The wallet will prompt, then the network runs web
          fetches + LLM equivalence. Watch the lifecycle strip above: pending → proposing → committing →
          revealing → accepted → finalized.
        </p>
      </div>
      <div className="panel">
        <h3>Official ruling</h3>
        {claim.status === "open" ? (
          <p className="hint">No ruling yet. Trigger adjudication to fetch FDA / NHTSA / CPSC records on-chain.</p>
        ) : (
          <>
            <div className="row">
              <span className="stamp open">{claim.agency || "NONE"}</span>
              <span className="mono">{claim.recall_number || "no recall number"}</span>
            </div>
            <p className="mt">
              <strong>{claim.matched_product || "No matched product"}</strong>
            </p>
            <p className="hint">{claim.reason_for_recall}</p>
            <div className="docket mt">
              <div className="small muted">Reasoning (leader result, stored after consensus)</div>
              <p>{claim.reasoning || "—"}</p>
            </div>
            {claim.classification ? <p className="hint mt">Classification: {claim.classification}</p> : null}
          </>
        )}
      </div>
    </section>
  );
}

function How() {
  return (
    <section className="mt grid-2">
      <div className="panel">
        <h3>GenLayer is the product</h3>
        <p>
          The consensus-critical decision is: <em>does an official recall cover this specific unit, and should
          the bond pay?</em> That decision moves GEN. The frontend never computes the ruling and stores it.
        </p>
        <div className="steps mt">
          <div className="step">
            <div className="num">1</div>
            <div>
              <strong>Real trust problem</strong>
              <div className="hint">Refunds today run through the same company that shipped the defect. The bond is the recourse.</div>
            </div>
          </div>
          <div className="step">
            <div className="num">2</div>
            <div>
              <strong>Authoritative data</strong>
              <div className="hint">Adjudicate() fetches live openFDA / NHTSA / CPSC. Validators re-fetch the same URLs.</div>
            </div>
          </div>
          <div className="step">
            <div className="num">3</div>
            <div>
              <strong>Full transaction lifecycle</strong>
              <div className="hint">Wallet signs writeContract. UI tracks pending → proposing → committing → revealing → accepted → finalized.</div>
            </div>
          </div>
        </div>
        <h3 className="mt">Sources the contract hits</h3>
        <ul className="hint">
          <li>FDA food / drug / device enforcement APIs (openFDA)</li>
          <li>NHTSA recallsByVehicle</li>
          <li>CPSC SaferProducts recall feed</li>
        </ul>
      </div>
      <div className="panel">
        <h3>Wallet, network, continued use</h3>
        <p className="hint">
          Connect MetaMask or OKX. Before every write the app calls{" "}
          <span className="mono">client.connect("{NETWORK_NAME}")</span> so the wallet is on{" "}
          {NETWORK_META[NETWORK_NAME].label} (chain {NETWORK_META[NETWORK_NAME].chainId}).
        </p>
        <p className="hint">
          Contract{" "}
          <a href={explorerAddr(CONTRACT_ADDRESS, NETWORK_NAME)} target="_blank" rel="noreferrer" className="mono">
            {CONTRACT_ADDRESS}
          </a>
        </p>
        <p className="hint">
          Test GEN:{" "}
          <a href={faucetUrl()} target="_blank" rel="noreferrer">
            {NETWORK_NAME === "studionet" ? "Studio faucet" : "GenLayer faucet"}
          </a>
          .
        </p>
        <h3 className="mt">Steward model</h3>
        <p className="hint">
          Entitlement is <strong>self-published bearer evidence</strong>, not verified ownership. The https
          page must contain <span className="mono">RECALLVAULT:&lt;vault&gt;:&lt;unit&gt;:&lt;claimant&gt;</span>.
          That page is never sent to the recall-scope LLM. Official FDA/NHTSA/CPSC records decide scope.
          Cancel takes a stake penalty and cooldown. <span className="mono">honor_claim</span> is sponsor
          settlement and does not write consensus eligibility. Payouts are irreversible only after FINALIZED +
          FINISHED_WITH_RETURN.
        </p>
      </div>
    </section>
  );
}
