export type OfficialHit = {
  agency: string;
  recall_number: string;
  title: string;
  reason: string;
  extra: string;
  source: string;
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 160)}`);
  }
  return res.json();
}

export async function scanFda(kind: "food" | "drug" | "device", query: string): Promise<OfficialHit[]> {
  const q = encodeURIComponent(query.trim());
  const path =
    kind === "food"
      ? "food/enforcement.json"
      : kind === "drug"
        ? "drug/enforcement.json"
        : "device/enforcement.json";
  const url = `https://api.fda.gov/${path}?search=(product_description:${q}+OR+recalling_firm:${q})&limit=6`;
  const data = (await getJson(url)) as { results?: Record<string, string>[]; error?: unknown };
  if (!data.results) return [];
  return data.results.map((row) => ({
    agency: "FDA",
    recall_number: row.recall_number || "—",
    title: row.product_description || row.recalling_firm || "FDA recall",
    reason: row.reason_for_recall || "",
    extra: [row.classification, row.status, row.code_info].filter(Boolean).join(" · "),
    source: url,
  }));
}

export async function scanNhtsa(make: string, model: string, year: string): Promise<OfficialHit[]> {
  const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
  const data = (await getJson(url)) as { results?: Record<string, string>[] };
  const rows = data.results || [];
  return rows.slice(0, 8).map((row) => ({
    agency: "NHTSA",
    recall_number: row.NHTSACampaignNumber || "—",
    title: row.Component || "Vehicle recall",
    reason: row.Summary || "",
    extra: row.Consequence || "",
    source: url,
  }));
}

export async function latestFdaFood(): Promise<OfficialHit[]> {
  const url = `https://api.fda.gov/food/enforcement.json?search=status:"Ongoing"&limit=6`;
  const data = (await getJson(url)) as { results?: Record<string, string>[] };
  if (!data.results) return [];
  return data.results.map((row) => ({
    agency: "FDA",
    recall_number: row.recall_number || "—",
    title: row.product_description || "Ongoing food recall",
    reason: row.reason_for_recall || "",
    extra: [row.recalling_firm, row.classification].filter(Boolean).join(" · "),
    source: url,
  }));
}
