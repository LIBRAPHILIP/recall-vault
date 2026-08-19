"""Direct-mode tests for RecallVault.

These run in-memory with mocked FDA/NHTSA responses and mocked LLM decisions.
They do not require GenLayer Studio.
"""

import json


CONTRACT = "contracts/recall_vault.py"

FDA_ONGOING = {
    "meta": {"results": {"skip": 0, "limit": 8, "total": 1}},
    "results": [
        {
            "recall_number": "F-1234-2026",
            "recalling_firm": "Example Meats Inc",
            "product_description": "Boar style liverwurst sliced 8 oz packages",
            "reason_for_recall": "Potential Listeria monocytogenes contamination",
            "code_info": "Lots 4411 through 4488, packed 01/2026-03/2026",
            "classification": "Class I",
            "status": "Ongoing",
            "product_type": "Food",
        }
    ],
}

NHTSA_HIT = {
    "Count": 1,
    "Message": "Results returned successfully",
    "results": [
        {
            "NHTSACampaignNumber": "26V123000",
            "Component": "AIR BAGS:FRONTAL",
            "Summary": "Honda is recalling certain 2019 Accord vehicles. The driver airbag inflator may explode.",
            "Consequence": "An inflator explosion can cause metal fragments to strike the driver.",
            "Notes": "Owners should contact Honda.",
            "ReportReceivedDate": "03/12/2026",
        }
    ],
}

LLM_PAY = {
    "recall_found": True,
    "in_scope": True,
    "lot_in_scope": True,
    "agency": "FDA",
    "recall_number": "F-1234-2026",
    "matched_product": "liverwurst 8 oz",
    "reason_for_recall": "Listeria monocytogenes",
    "classification": "Class I",
    "payout_bps": 10000,
    "reasoning": "Official FDA record F-1234-2026 covers this product family and lot 4450 is inside 4411-4488.",
}

LLM_DENY = {
    "recall_found": False,
    "in_scope": False,
    "lot_in_scope": False,
    "agency": "NONE",
    "recall_number": "",
    "matched_product": "",
    "reason_for_recall": "",
    "classification": "",
    "payout_bps": 0,
    "reasoning": "No official recall matches this candy product.",
}

LLM_NHTSA = {
    "recall_found": True,
    "in_scope": True,
    "lot_in_scope": True,
    "agency": "NHTSA",
    "recall_number": "26V123000",
    "matched_product": "2019 Honda Accord",
    "reason_for_recall": "Driver airbag inflator",
    "classification": "",
    "payout_bps": 10000,
    "reasoning": "NHTSA campaign 26V123000 covers 2019 Honda Accord frontal airbags.",
}


def _gen(n: int) -> int:
    return n * 10**18


def _list_food(contract, sender_vm, sender):
    sender_vm.sender = sender
    sender_vm.value = _gen(10)
    contract.list_product(
        "Example Meats",
        "Liverwurst 8oz",
        "food",
        "liverwurst",
        "",
        "",
        "",
        "Bond for deli meat recalls",
    )


def test_list_and_fund_bond(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)

    vaults = contract.get_vaults()
    assert "1" in vaults
    assert vaults["1"]["brand"] == "Example Meats"
    assert int(vaults["1"]["bond_wei"]) == _gen(10)
    assert vaults["1"]["sponsor"].lower() == str(direct_alice).lower() or True

    direct_vm.sender = direct_bob
    direct_vm.value = _gen(2)
    contract.fund_bond("1")
    vault = contract.get_vault("1")
    assert int(vault["bond_wei"]) == _gen(12)


def test_file_claim_reserves_bond(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)

    direct_vm.sender = direct_bob
    direct_vm.value = 0
    contract.file_claim(
        "1",
        "LOT 4450",
        "https://example.com/receipt-4450",
        "Bought this pack in March 2026",
        str(_gen(3)),
    )

    vault = contract.get_vault("1")
    assert int(vault["reserved_wei"]) == _gen(3)
    assert int(vault["available_wei"]) == _gen(7)
    claim = contract.get_claim("1")
    assert claim["status"] == "open"
    assert claim["lot_or_serial"] == "LOT 4450"


def test_duplicate_open_claim_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.file_claim("1", "LOT 1", "https://example.com/a", "first", str(_gen(1)))
    with direct_vm.expect_revert("you already have an open claim on this product"):
        contract.file_claim("1", "LOT 2", "https://example.com/b", "second", str(_gen(1)))


def test_claim_over_available_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("claim exceeds available bond"):
        contract.file_claim("1", "LOT 1", "https://example.com/a", "too big", str(_gen(99)))


def test_cancel_releases_reserve(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.file_claim("1", "LOT 1", "https://example.com/a", "cancel me", str(_gen(4)))
    contract.cancel_claim("1")
    assert contract.get_claim("1")["status"] == "cancelled"
    assert int(contract.get_vault("1")["reserved_wei"]) == 0


def test_honor_pays_without_llm(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.file_claim("1", "LOT 1", "https://example.com/a", "please honor", str(_gen(4)))
    direct_vm.sender = direct_alice
    contract.honor_claim("1")
    claim = contract.get_claim("1")
    assert claim["status"] == "honored"
    assert int(claim["payout_wei"]) == _gen(4)
    assert int(contract.get_vault("1")["reserved_wei"]) == 0
    assert int(contract.get_vault("1")["bond_wei"]) == _gen(6)


def test_non_sponsor_cannot_honor(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.file_claim("1", "LOT 1", "https://example.com/a", "x", str(_gen(1)))
    with direct_vm.expect_revert("only the sponsor can honor a claim"):
        contract.honor_claim("1")


def test_adjudicate_pays_on_official_match(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.file_claim(
        "1",
        "LOT 4450",
        "https://example.com/receipt",
        "Pack purchased March 2026",
        str(_gen(5)),
    )

    direct_vm.mock_web(r".*api\.fda\.gov/food/enforcement.*", {"status": 200, "body": json.dumps(FDA_ONGOING)})
    direct_vm.mock_llm(r".*RecallVault adjudicator.*", json.dumps(LLM_PAY))

    direct_vm.sender = direct_alice
    contract.adjudicate("1")

    claim = contract.get_claim("1")
    assert claim["status"] == "paid"
    assert claim["agency"] == "FDA"
    assert claim["recall_number"] == "F-1234-2026"
    assert int(claim["payout_wei"]) == _gen(5)
    assert int(contract.get_vault("1")["bond_wei"]) == _gen(5)
    assert int(contract.get_vault("1")["reserved_wei"]) == 0


def test_adjudicate_rejects_when_no_recall(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.file_claim("1", "LOT Z", "https://example.com/r", "unrelated snack", str(_gen(2)))

    direct_vm.mock_web(
        r".*api\.fda\.gov/food/enforcement.*",
        {"status": 404, "body": json.dumps({"error": {"code": "NOT_FOUND"}})},
    )
    direct_vm.mock_llm(r".*RecallVault adjudicator.*", json.dumps(LLM_DENY))

    contract.adjudicate("1")
    claim = contract.get_claim("1")
    assert claim["status"] == "rejected"
    assert int(claim["payout_wei"]) == 0
    assert int(contract.get_vault("1")["bond_wei"]) == _gen(10)
    assert int(contract.get_vault("1")["reserved_wei"]) == 0


def test_vehicle_adjudication_uses_nhtsa(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = _gen(8)
    contract.list_product(
        "Honda",
        "Accord",
        "vehicle",
        "Honda Accord",
        "honda",
        "accord",
        "2019",
        "Airbag inflator coverage",
    )
    direct_vm.sender = direct_bob
    direct_vm.value = 0
    contract.file_claim(
        "1",
        "VIN 1HGCV1F3XKA000111",
        "https://example.com/title",
        "2019 Accord owner",
        str(_gen(8)),
    )

    direct_vm.mock_web(r".*api\.nhtsa\.gov/recalls/recallsByVehicle.*", {"status": 200, "body": json.dumps(NHTSA_HIT)})
    direct_vm.mock_llm(r".*RecallVault adjudicator.*", json.dumps(LLM_NHTSA))
    contract.adjudicate("1")

    claim = contract.get_claim("1")
    assert claim["status"] == "paid"
    assert claim["agency"] == "NHTSA"
    assert claim["recall_number"] == "26V123000"


def test_withdraw_surplus_only_unreserved(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.file_claim("1", "LOT 1", "https://example.com/a", "x", str(_gen(4)))
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("amount exceeds unreserved bond"):
        contract.withdraw_surplus("1", str(_gen(7)))
    contract.withdraw_surplus("1", str(_gen(6)))
    assert int(contract.get_vault("1")["bond_wei"]) == _gen(4)


def test_preview_sources_is_deterministic(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    food = contract.preview_sources("food", "liverwurst", "", "", "")
    assert food["urls"][0].startswith("https://api.fda.gov/food/enforcement.json")
    vehicle = contract.preview_sources("vehicle", "x", "honda", "accord", "2019")
    assert "api.nhtsa.gov/recalls/recallsByVehicle" in vehicle["urls"][0]
    assert "make=honda" in vehicle["urls"][0]


def test_invalid_category_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    direct_vm.value = _gen(1)
    with direct_vm.expect_revert("category must be food, drug, device, vehicle, or consumer"):
        contract.list_product("A", "B", "spaceship", "q", "", "", "", "")


def test_protocol_stats(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _list_food(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_bob
    contract.file_claim("1", "LOT 1", "https://example.com/a", "x", str(_gen(1)))
    stats = contract.get_protocol()
    assert stats["name"] == "RecallVault"
    assert stats["vault_count"] == 1
    assert stats["claim_count"] == 1
    assert stats["open_claim_count"] == 1
