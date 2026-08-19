export type DiscoveredWallet = {
  id: string;
  name: string;
  rdns: string;
  icon?: string;
  provider: Eip1193Provider;
  kind: "metamask" | "okx" | "injected";
};

const LEGACY_RDNS: Record<string, DiscoveredWallet["kind"]> = {
  "io.metamask": "metamask",
  "io.metamask.flask": "metamask",
  "com.okex.wallet": "okx",
  "com.okx.wallet": "okx",
};

function classify(name: string, rdns: string, provider: Eip1193Provider): DiscoveredWallet["kind"] {
  const blob = `${name} ${rdns}`.toLowerCase();
  if (blob.includes("okx") || blob.includes("okex") || provider.isOkxWallet || provider.isOKExWallet) {
    return "okx";
  }
  if (blob.includes("metamask") || provider.isMetaMask) return "metamask";
  return "injected";
}

export function discoverWallets(): Promise<DiscoveredWallet[]> {
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredWallet>();

    const add = (wallet: DiscoveredWallet) => {
      found.set(wallet.rdns || wallet.id, wallet);
    };

    const onAnnounce = (event: Event) => {
      const detail = (event as Eip6963AnnounceEvent).detail;
      if (!detail?.provider || !detail.info) return;
      add({
        id: detail.info.uuid,
        name: detail.info.name,
        rdns: detail.info.rdns,
        icon: detail.info.icon,
        provider: detail.provider,
        kind: classify(detail.info.name, detail.info.rdns, detail.provider),
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);

      const injected = window.ethereum;
      const okx = window.okxwallet;
      if (okx && ![...found.values()].some((w) => w.kind === "okx")) {
        add({
          id: "legacy-okx",
          name: "OKX Wallet",
          rdns: "com.okex.wallet",
          provider: okx,
          kind: "okx",
        });
      }
      if (injected) {
        const providers = injected.providers?.length ? injected.providers : [injected];
        for (const provider of providers) {
          const kind = classify(
            provider.isMetaMask ? "MetaMask" : provider.isOkxWallet ? "OKX Wallet" : "Injected",
            "",
            provider
          );
          const rdns =
            kind === "metamask" ? "io.metamask" : kind === "okx" ? "com.okex.wallet" : `injected-${found.size}`;
          if ([...found.values()].some((w) => w.kind === kind && kind !== "injected")) continue;
          add({
            id: `legacy-${rdns}`,
            name: kind === "metamask" ? "MetaMask" : kind === "okx" ? "OKX Wallet" : "Browser wallet",
            rdns,
            provider,
            kind,
          });
        }
      }

      const preferred = [...found.values()].sort((a, b) => {
        const rank = (k: DiscoveredWallet["kind"]) => (k === "metamask" ? 0 : k === "okx" ? 1 : 2);
        return rank(a.kind) - rank(b.kind);
      });
      resolve(preferred);
    }, 80);
  });
}

export async function requestAccounts(provider: Eip1193Provider): Promise<string> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("No account returned by the wallet");
  return accounts[0];
}

export async function getChainId(provider: Eip1193Provider): Promise<number> {
  const hex = (await provider.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(hex, 16);
}

export function listenWallet(
  provider: Eip1193Provider,
  handlers: {
    onAccounts?: (accounts: string[]) => void;
    onChain?: (chainId: string) => void;
  }
): () => void {
  const acc = (...args: unknown[]) => handlers.onAccounts?.(args[0] as string[]);
  const chain = (...args: unknown[]) => handlers.onChain?.(args[0] as string);
  provider.on?.("accountsChanged", acc);
  provider.on?.("chainChanged", chain);
  return () => {
    provider.removeListener?.("accountsChanged", acc);
    provider.removeListener?.("chainChanged", chain);
  };
}

export { LEGACY_RDNS };
