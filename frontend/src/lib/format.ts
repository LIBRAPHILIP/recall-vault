export const WEI = 10n ** 18n;

/** Studio simulates GEN as whole units. Bradbury/Asimov use 18 decimals. */
export const GEN_DECIMALS =
  import.meta.env.VITE_NETWORK === "studionet" || import.meta.env.VITE_NETWORK === "localnet" ? 0 : 18;

export function asStr(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const s = asStr(value).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export function parseWei(genAmount: string): bigint {
  const trimmed = genAmount.trim();
  if (!trimmed) return 0n;
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fracRaw)) {
    throw new Error("Enter a valid GEN amount");
  }
  if (GEN_DECIMALS === 0) {
    if (fracRaw.replace(/0+$/, "")) throw new Error("Studionet amounts are whole GEN");
    return BigInt(whole);
  }
  const frac = (fracRaw + "0".repeat(GEN_DECIMALS)).slice(0, GEN_DECIMALS);
  return BigInt(whole) * 10n ** BigInt(GEN_DECIMALS) + BigInt(frac || "0");
}

export function formatGen(wei: string | bigint | number, digits = 4): string {
  let value: bigint;
  try {
    value = typeof wei === "bigint" ? wei : BigInt(asStr(wei) || "0");
  } catch {
    return "0";
  }
  const neg = value < 0n;
  const abs = neg ? -value : value;
  if (GEN_DECIMALS === 0) return `${neg ? "-" : ""}${abs.toString()}`;
  const base = 10n ** BigInt(GEN_DECIMALS);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(GEN_DECIMALS, "0").slice(0, digits);
  const trimmed = frac.replace(/0+$/, "");
  const body = trimmed ? `${whole.toString()}.${trimmed}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function explorerTx(hash: string, network: string): string {
  if (network === "testnetBradbury") return `https://explorer-bradbury.genlayer.com/tx/${hash}`;
  if (network === "testnetAsimov") return `https://explorer-asimov.genlayer.com/tx/${hash}`;
  if (network === "studionet") return `https://explorer-studio.genlayer.com/tx/${hash}`;
  return `#${hash}`;
}

export function explorerAddr(addr: string, network: string): string {
  if (network === "testnetBradbury") return `https://explorer-bradbury.genlayer.com/address/${addr}`;
  if (network === "testnetAsimov") return `https://explorer-asimov.genlayer.com/address/${addr}`;
  if (network === "studionet") return `https://explorer-studio.genlayer.com/address/${addr}`;
  return `#${addr}`;
}

export function faucetUrl(network = import.meta.env.VITE_NETWORK): string {
  if (network === "studionet") return "https://studio.genlayer.com";
  if (network === "localnet") return "http://localhost:8080";
  return "https://testnet-faucet.genlayer.foundation";
}

export function sameAddr(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function timeAgo(iso: string): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
