# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""RecallVault — consumer recall bonds settled from official government data.

A sponsor (manufacturer, retailer, insurer, or advocacy group) lists a product
and locks GEN. A claimant files against that bond with a lot/serial and a
public proof URL. Adjudication fetches live FDA / NHTSA / CPSC records and
releases or rejects the claim. The Intelligent Contract — not a backend LLM —
owns the decision that moves money.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from genlayer import *


# ---------------------------------------------------------------------------
# Storage records
# ---------------------------------------------------------------------------


@allow_storage
@dataclass
class Product:
    id: str
    sponsor: Address
    brand: str
    name: str
    category: str
    search_query: str
    vehicle_make: str
    vehicle_model: str
    vehicle_year: str
    notes: str
    bond_wei: u256
    reserved_wei: u256
    created_at: str
    active: bool


@allow_storage
@dataclass
class Claim:
    id: str
    product_id: str
    claimant: Address
    lot_or_serial: str
    proof_url: str
    statement: str
    amount_wei: u256
    status: str
    filed_at: str
    resolved_at: str
    adjudicator: Address
    agency: str
    recall_number: str
    matched_product: str
    reason_for_recall: str
    classification: str
    reasoning: str
    payout_wei: u256


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


# ---------------------------------------------------------------------------
# Helpers (deterministic)
# ---------------------------------------------------------------------------

ALLOWED_CATEGORIES = ("food", "drug", "device", "vehicle", "consumer")
OPEN_STATUS = "open"
HONORED_STATUS = "honored"
PAID_STATUS = "paid"
REJECTED_STATUS = "rejected"
CANCELLED_STATUS = "cancelled"

ZERO_ADDR = Address("0x0000000000000000000000000000000000000000")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize(text: str, limit: int = 120) -> str:
    cleaned = []
    for ch in text.strip():
        if ch.isalnum() or ch in " -_.'|&":
            cleaned.append(ch)
        else:
            cleaned.append(" ")
    return "".join(cleaned).strip()[:limit]


def _url_encode(text: str) -> str:
    out = []
    for ch in text:
        code = ord(ch)
        if ch.isalnum() or ch in "-._":
            out.append(ch)
        elif ch == " ":
            out.append("+")
        else:
            out.append("%{:02X}".format(code))
    return "".join(out)


def _as_int(value) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    try:
        return int(str(value).strip())
    except Exception:
        return 0


def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1", "y")
    return False


def _bucket_payout_bps(bps: int) -> int:
    if bps <= 0:
        return 0
    if bps < 3750:
        return 2500
    if bps < 6250:
        return 5000
    if bps < 8750:
        return 7500
    return 10000


def _official_urls(category: str, search_query: str, make: str, model: str, year: str) -> list:
    """Deterministic official endpoints. Validators must hit the same URLs."""
    q = _url_encode(search_query)
    urls = []
    if category == "food":
        urls.append(
            "https://api.fda.gov/food/enforcement.json?search=(product_description:"
            + q
            + "+OR+recalling_firm:"
            + q
            + ")&limit=8"
        )
    elif category == "drug":
        urls.append(
            "https://api.fda.gov/drug/enforcement.json?search=(product_description:"
            + q
            + "+OR+recalling_firm:"
            + q
            + ")&limit=8"
        )
    elif category == "device":
        urls.append(
            "https://api.fda.gov/device/enforcement.json?search=(product_description:"
            + q
            + "+OR+recalling_firm:"
            + q
            + ")&limit=8"
        )
    elif category == "vehicle":
        urls.append(
            "https://api.nhtsa.gov/recalls/recallsByVehicle?make="
            + _url_encode(make)
            + "&model="
            + _url_encode(model)
            + "&modelYear="
            + _url_encode(year)
        )
    else:
        urls.append(
            "https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallTitle="
            + q
        )
        urls.append(
            "https://api.fda.gov/device/enforcement.json?search=product_description:"
            + q
            + "&limit=5"
        )
    return urls


def _body_text(res) -> str:
    body = getattr(res, "body", res)
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    return str(body)


def _compact_records(category: str, raw_text: str) -> list:
    """Keep only stable official fields so leader and validators share structure."""
    try:
        data = json.loads(raw_text)
    except Exception:
        return [{"raw_excerpt": raw_text[:1500]}]

    if isinstance(data, dict) and data.get("error"):
        return [{"api_error": str(data.get("error"))}]

    records = []
    if category == "vehicle":
        results = []
        if isinstance(data, dict):
            results = data.get("results") or data.get("Results") or []
        if isinstance(results, dict):
            results = [results]
        for row in results[:8]:
            if not isinstance(row, dict):
                continue
            records.append(
                {
                    "recall_number": row.get("NHTSACampaignNumber") or row.get("nhtsaCampaignNumber") or "",
                    "component": (row.get("Component") or "")[:200],
                    "summary": (row.get("Summary") or "")[:500],
                    "consequence": (row.get("Consequence") or "")[:300],
                    "notes": (row.get("Notes") or "")[:200],
                    "report_date": row.get("ReportReceivedDate") or "",
                }
            )
        return records

    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        rows = data.get("results") or data.get("Results") or data.get("Recall") or []
        if isinstance(rows, dict):
            rows = [rows]
    else:
        rows = []

    for row in rows[:8]:
        if not isinstance(row, dict):
            continue
        records.append(
            {
                "recall_number": row.get("recall_number")
                or row.get("RecallNumber")
                or row.get("RecallID")
                or "",
                "recalling_firm": (row.get("recalling_firm") or row.get("Manufacturer") or "")[:160],
                "product_description": (
                    row.get("product_description") or row.get("Title") or row.get("Name") or ""
                )[:500],
                "reason_for_recall": (
                    row.get("reason_for_recall") or row.get("Hazard") or row.get("Description") or ""
                )[:400],
                "code_info": (row.get("code_info") or row.get("ConsumerContact") or "")[:300],
                "classification": row.get("classification") or row.get("RecallType") or "",
                "status": row.get("status") or "",
            }
        )
    return records


def _parse_llm_json(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    text = str(raw).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1:
        raise gl.vm.UserError("LLM returned no JSON object")
    return json.loads(text[first : last + 1])


def _normalize_decision(raw: dict) -> dict:
    agency = str(raw.get("agency") or "NONE").strip().upper()
    if agency not in ("FDA", "NHTSA", "CPSC", "NONE"):
        agency = "NONE"
    payout_bps = max(0, min(10000, _as_int(raw.get("payout_bps"))))
    recall_found = _truthy(raw.get("recall_found"))
    in_scope = _truthy(raw.get("in_scope"))
    lot_in_scope = _truthy(raw.get("lot_in_scope"))
    if not recall_found or not in_scope:
        payout_bps = 0
        in_scope = False
    return {
        "recall_found": recall_found,
        "in_scope": in_scope,
        "lot_in_scope": lot_in_scope,
        "agency": agency,
        "recall_number": str(raw.get("recall_number") or "")[:80],
        "matched_product": str(raw.get("matched_product") or "")[:200],
        "reason_for_recall": str(raw.get("reason_for_recall") or "")[:400],
        "classification": str(raw.get("classification") or "")[:40],
        "payout_bps": payout_bps,
        "reasoning": str(raw.get("reasoning") or "")[:800],
    }


def _decisions_equivalent(leader: dict, validator: dict) -> bool:
    if leader["recall_found"] != validator["recall_found"]:
        return False
    if leader["in_scope"] != validator["in_scope"]:
        return False
    if leader["lot_in_scope"] != validator["lot_in_scope"]:
        return False
    if leader["agency"] != validator["agency"]:
        return False
    lb = _bucket_payout_bps(leader["payout_bps"])
    vb = _bucket_payout_bps(validator["payout_bps"])
    if lb == 0 or vb == 0:
        return lb == vb
    return lb == vb


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


class RecallVault(gl.Contract):
    owner: Address
    next_product_id: u256
    next_claim_id: u256
    products: TreeMap[str, Product]
    claims: TreeMap[str, Claim]
    protocol_name: str

    def __init__(self):
        self.owner = gl.message.sender_address
        self.next_product_id = u256(1)
        self.next_claim_id = u256(1)
        self.protocol_name = "RecallVault"

    # -- internal -----------------------------------------------------------

    def _product_dict(self, p: Product) -> dict:
        available = int(p.bond_wei) - int(p.reserved_wei)
        if available < 0:
            available = 0
        return {
            "id": p.id,
            "sponsor": p.sponsor.as_hex,
            "brand": p.brand,
            "name": p.name,
            "category": p.category,
            "search_query": p.search_query,
            "vehicle_make": p.vehicle_make,
            "vehicle_model": p.vehicle_model,
            "vehicle_year": p.vehicle_year,
            "notes": p.notes,
            "bond_wei": str(int(p.bond_wei)),
            "reserved_wei": str(int(p.reserved_wei)),
            "available_wei": str(available),
            "created_at": p.created_at,
            "active": p.active,
        }

    def _claim_dict(self, c: Claim) -> dict:
        return {
            "id": c.id,
            "product_id": c.product_id,
            "claimant": c.claimant.as_hex,
            "lot_or_serial": c.lot_or_serial,
            "proof_url": c.proof_url,
            "statement": c.statement,
            "amount_wei": str(int(c.amount_wei)),
            "status": c.status,
            "filed_at": c.filed_at,
            "resolved_at": c.resolved_at,
            "adjudicator": c.adjudicator.as_hex,
            "agency": c.agency,
            "recall_number": c.recall_number,
            "matched_product": c.matched_product,
            "reason_for_recall": c.reason_for_recall,
            "classification": c.classification,
            "reasoning": c.reasoning,
            "payout_wei": str(int(c.payout_wei)),
        }

    def _require_product(self, product_id: str) -> Product:
        if product_id not in self.products:
            raise gl.vm.UserError("unknown product")
        return self.products[product_id]

    def _require_claim(self, claim_id: str) -> Claim:
        if claim_id not in self.claims:
            raise gl.vm.UserError("unknown claim")
        return self.claims[claim_id]

    def _available(self, product: Product) -> int:
        return int(product.bond_wei) - int(product.reserved_wei)

    def _pay(self, to: Address, amount: u256) -> None:
        if int(amount) <= 0:
            return
        _Recipient(to).emit_transfer(value=amount)

    def _evaluate_claim(self, snapshot: dict) -> dict:
        urls = _official_urls(
            snapshot["category"],
            snapshot["search_query"],
            snapshot["vehicle_make"],
            snapshot["vehicle_model"],
            snapshot["vehicle_year"],
        )

        def fetch_and_judge() -> dict:
            bundles = []
            for url in urls:
                try:
                    res = gl.nondet.web.get(url)
                    status = int(getattr(res, "status_code", 200) or 200)
                    text = _body_text(res)
                    if status >= 500:
                        raise gl.vm.UserError("official source unavailable: " + str(status))
                    records = _compact_records(snapshot["category"], text)
                    bundles.append({"url": url, "status": status, "records": records})
                except gl.vm.UserError:
                    raise
                except Exception as exc:
                    bundles.append({"url": url, "status": 0, "error": str(exc)[:200], "records": []})

            prompt = f"""You are the RecallVault adjudicator. Decide whether a consumer claim
is covered by an OFFICIAL government product recall.

Use ONLY the official records below. Do not invent recalls. If the records do
not clearly cover this specific product / lot / vehicle, deny the claim.

PRODUCT
- brand: {snapshot["brand"]}
- name: {snapshot["name"]}
- category: {snapshot["category"]}
- search_query: {snapshot["search_query"]}
- vehicle: {snapshot["vehicle_make"]} {snapshot["vehicle_model"]} {snapshot["vehicle_year"]}
- sponsor notes: {snapshot["notes"]}

CLAIM
- lot_or_serial: {snapshot["lot_or_serial"]}
- claimant_statement: {snapshot["statement"]}
- proof_url: {snapshot["proof_url"]}

OFFICIAL RECORDS (FDA / NHTSA / CPSC)
{json.dumps(bundles)[:12000]}

Rules:
1. recall_found = true only if an official record is about this product family.
2. in_scope = true only if THIS unit (lot, serial, VIN fragment, model year) is
   covered by that record, or the record has no lot restriction and the product
   clearly matches.
3. lot_in_scope = true if the lot/serial is listed or the recall has no lot limit.
4. agency must be FDA, NHTSA, CPSC, or NONE.
5. payout_bps is 0-10000. Use 10000 for a clear full match, 5000 if coverage
   is partial, 0 if denied. Never pay when in_scope is false.
6. Prefer denial when evidence is thin, contradictory, or off-product.

Return JSON with keys:
recall_found (bool), in_scope (bool), lot_in_scope (bool),
agency (FDA|NHTSA|CPSC|NONE), recall_number (str), matched_product (str),
reason_for_recall (str), classification (str), payout_bps (int 0-10000),
reasoning (str, 2-4 sentences grounded in the official records).
"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return _normalize_decision(_parse_llm_json(raw))

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                try:
                    fetch_and_judge()
                    return False
                except Exception:
                    return False
            mine = fetch_and_judge()
            return _decisions_equivalent(leader_result.calldata, mine)

        return gl.vm.run_nondet_unsafe(fetch_and_judge, validator_fn)

    # -- writes -------------------------------------------------------------

    @gl.public.write.payable
    def list_product(
        self,
        brand: str,
        name: str,
        category: str,
        search_query: str,
        vehicle_make: str,
        vehicle_model: str,
        vehicle_year: str,
        notes: str,
    ) -> None:
        cat = category.strip().lower()
        if cat not in ALLOWED_CATEGORIES:
            raise gl.vm.UserError("category must be food, drug, device, vehicle, or consumer")
        brand_s = _sanitize(brand, 80)
        name_s = _sanitize(name, 120)
        query_s = _sanitize(search_query or name or brand, 120)
        if not brand_s or not name_s or not query_s:
            raise gl.vm.UserError("brand, name, and search query are required")
        make_s = _sanitize(vehicle_make, 40)
        model_s = _sanitize(vehicle_model, 60)
        year_s = _sanitize(vehicle_year, 8)
        if cat == "vehicle" and (not make_s or not model_s or not year_s):
            raise gl.vm.UserError("vehicle listings need make, model, and year")

        pid = str(int(self.next_product_id))
        self.next_product_id = u256(int(self.next_product_id) + 1)
        bond = gl.message.value
        product = Product(
            id=pid,
            sponsor=gl.message.sender_address,
            brand=brand_s,
            name=name_s,
            category=cat,
            search_query=query_s,
            vehicle_make=make_s,
            vehicle_model=model_s,
            vehicle_year=year_s,
            notes=_sanitize(notes, 280),
            bond_wei=bond,
            reserved_wei=u256(0),
            created_at=_now_iso(),
            active=True,
        )
        self.products[pid] = product

    @gl.public.write.payable
    def fund_bond(self, product_id: str) -> None:
        product = self._require_product(product_id)
        if not product.active:
            raise gl.vm.UserError("product is inactive")
        added = gl.message.value
        if int(added) <= 0:
            raise gl.vm.UserError("send GEN to fund the bond")
        product.bond_wei = u256(int(product.bond_wei) + int(added))

    @gl.public.write
    def deactivate_product(self, product_id: str) -> None:
        product = self._require_product(product_id)
        if gl.message.sender_address != product.sponsor:
            raise gl.vm.UserError("only the sponsor can deactivate")
        product.active = False

    @gl.public.write
    def withdraw_surplus(self, product_id: str, amount_wei: str) -> None:
        product = self._require_product(product_id)
        if gl.message.sender_address != product.sponsor:
            raise gl.vm.UserError("only the sponsor can withdraw surplus")
        amount = u256(int(amount_wei))
        if int(amount) <= 0:
            raise gl.vm.UserError("amount must be positive")
        if int(amount) > self._available(product):
            raise gl.vm.UserError("amount exceeds unreserved bond")
        product.bond_wei = u256(int(product.bond_wei) - int(amount))
        self._pay(product.sponsor, amount)

    @gl.public.write
    def file_claim(
        self,
        product_id: str,
        lot_or_serial: str,
        proof_url: str,
        statement: str,
        amount_wei: str,
    ) -> None:
        product = self._require_product(product_id)
        if not product.active:
            raise gl.vm.UserError("product is inactive")
        amount = u256(int(amount_wei))
        if int(amount) <= 0:
            raise gl.vm.UserError("claim amount must be positive")
        if int(amount) > self._available(product):
            raise gl.vm.UserError("claim exceeds available bond")
        url = proof_url.strip()
        if not (url.startswith("https://") or url.startswith("http://")):
            raise gl.vm.UserError("proof_url must be a public http(s) URL")
        lot = _sanitize(lot_or_serial, 80)
        if not lot:
            raise gl.vm.UserError("lot or serial is required")

        sender = gl.message.sender_address
        for _cid, existing in self.claims.items():
            if (
                existing.product_id == product_id
                and existing.claimant == sender
                and existing.status == OPEN_STATUS
            ):
                raise gl.vm.UserError("you already have an open claim on this product")

        cid = str(int(self.next_claim_id))
        self.next_claim_id = u256(int(self.next_claim_id) + 1)
        product.reserved_wei = u256(int(product.reserved_wei) + int(amount))
        claim = Claim(
            id=cid,
            product_id=product_id,
            claimant=sender,
            lot_or_serial=lot,
            proof_url=url[:300],
            statement=_sanitize(statement, 400),
            amount_wei=amount,
            status=OPEN_STATUS,
            filed_at=_now_iso(),
            resolved_at="",
            adjudicator=ZERO_ADDR,
            agency="",
            recall_number="",
            matched_product="",
            reason_for_recall="",
            classification="",
            reasoning="",
            payout_wei=u256(0),
        )
        self.claims[cid] = claim

    @gl.public.write
    def cancel_claim(self, claim_id: str) -> None:
        claim = self._require_claim(claim_id)
        if claim.status != OPEN_STATUS:
            raise gl.vm.UserError("claim is not open")
        if gl.message.sender_address != claim.claimant:
            raise gl.vm.UserError("only the claimant can cancel")
        product = self._require_product(claim.product_id)
        reserved = int(product.reserved_wei) - int(claim.amount_wei)
        product.reserved_wei = u256(reserved if reserved > 0 else 0)
        claim.status = CANCELLED_STATUS
        claim.resolved_at = _now_iso()

    @gl.public.write
    def honor_claim(self, claim_id: str) -> None:
        """Sponsor accepts the claim without waiting for official-data consensus."""
        claim = self._require_claim(claim_id)
        if claim.status != OPEN_STATUS:
            raise gl.vm.UserError("claim is not open")
        product = self._require_product(claim.product_id)
        if gl.message.sender_address != product.sponsor:
            raise gl.vm.UserError("only the sponsor can honor a claim")
        payout = claim.amount_wei
        reserved = int(product.reserved_wei) - int(claim.amount_wei)
        product.reserved_wei = u256(reserved if reserved > 0 else 0)
        bond = int(product.bond_wei) - int(payout)
        product.bond_wei = u256(bond if bond > 0 else 0)
        claim.status = HONORED_STATUS
        claim.payout_wei = payout
        claim.resolved_at = _now_iso()
        claim.adjudicator = gl.message.sender_address
        claim.reasoning = "Sponsor honored the claim without official-data adjudication."
        self._pay(claim.claimant, payout)

    @gl.public.write
    def adjudicate(self, claim_id: str) -> None:
        """Consensus-critical path: fetch official recalls and settle the claim."""
        claim = self._require_claim(claim_id)
        if claim.status != OPEN_STATUS:
            raise gl.vm.UserError("claim is not open")
        product = self._require_product(claim.product_id)

        snapshot = {
            "brand": product.brand,
            "name": product.name,
            "category": product.category,
            "search_query": product.search_query,
            "vehicle_make": product.vehicle_make,
            "vehicle_model": product.vehicle_model,
            "vehicle_year": product.vehicle_year,
            "notes": product.notes,
            "lot_or_serial": claim.lot_or_serial,
            "statement": claim.statement,
            "proof_url": claim.proof_url,
        }

        decision = self._evaluate_claim(snapshot)

        reserved = int(product.reserved_wei) - int(claim.amount_wei)
        product.reserved_wei = u256(reserved if reserved > 0 else 0)
        claim.adjudicator = gl.message.sender_address
        claim.resolved_at = _now_iso()
        claim.agency = decision["agency"]
        claim.recall_number = decision["recall_number"]
        claim.matched_product = decision["matched_product"]
        claim.reason_for_recall = decision["reason_for_recall"]
        claim.classification = decision["classification"]
        claim.reasoning = decision["reasoning"]

        if decision["in_scope"] and decision["payout_bps"] > 0:
            payout = u256(int(claim.amount_wei) * int(decision["payout_bps"]) // 10000)
            if int(payout) > int(product.bond_wei):
                payout = product.bond_wei
            bond = int(product.bond_wei) - int(payout)
            product.bond_wei = u256(bond if bond > 0 else 0)
            claim.payout_wei = payout
            claim.status = PAID_STATUS
            self._pay(claim.claimant, payout)
        else:
            claim.payout_wei = u256(0)
            claim.status = REJECTED_STATUS

    # -- views --------------------------------------------------------------

    @gl.public.view
    def get_protocol(self) -> dict:
        vault_count = 0
        claim_count = 0
        open_count = 0
        total_bond = 0
        for _k, p in self.products.items():
            vault_count += 1
            total_bond += int(p.bond_wei)
        for _k, c in self.claims.items():
            claim_count += 1
            if c.status == OPEN_STATUS:
                open_count += 1
        return {
            "name": self.protocol_name,
            "owner": self.owner.as_hex,
            "vault_count": vault_count,
            "claim_count": claim_count,
            "open_claim_count": open_count,
            "total_bond_wei": str(total_bond),
            "next_product_id": str(int(self.next_product_id)),
            "next_claim_id": str(int(self.next_claim_id)),
        }

    @gl.public.view
    def get_vault(self, product_id: str) -> dict:
        return self._product_dict(self._require_product(product_id))

    @gl.public.view
    def get_vaults(self) -> dict:
        return {k: self._product_dict(v) for k, v in self.products.items()}

    @gl.public.view
    def get_claim(self, claim_id: str) -> dict:
        return self._claim_dict(self._require_claim(claim_id))

    @gl.public.view
    def get_claims(self) -> dict:
        return {k: self._claim_dict(v) for k, v in self.claims.items()}

    @gl.public.view
    def get_claims_for_product(self, product_id: str) -> dict:
        out = {}
        for k, c in self.claims.items():
            if c.product_id == product_id:
                out[k] = self._claim_dict(c)
        return out

    @gl.public.view
    def preview_sources(
        self,
        category: str,
        search_query: str,
        vehicle_make: str,
        vehicle_model: str,
        vehicle_year: str,
    ) -> dict:
        """Lets the UI show the exact official URLs the contract will fetch."""
        cat = category.strip().lower()
        urls = _official_urls(
            cat,
            _sanitize(search_query, 120),
            _sanitize(vehicle_make, 40),
            _sanitize(vehicle_model, 60),
            _sanitize(vehicle_year, 8),
        )
        return {"category": cat, "urls": urls}
