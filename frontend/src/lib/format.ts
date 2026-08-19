export const WEI = 10n ** 18n;

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
  const frac = (fracRaw + "000000000000000000").slice(0, 18);
  return BigInt(whole) * WEI + BigInt(frac);
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
  const whole = abs / WEI;
  const frac = (abs % WEI).toString().padStart(18, "0").slice(0, digits);
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

export function faucetUrl(): string {
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
