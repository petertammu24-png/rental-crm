"""Iteration 7 tests: stock overlap enforcement, schedules, revenue filtering, bill prefixes, and regressions."""
from __future__ import annotations

import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing from /app/frontend/.env")
API = f"{BASE_URL}/api"
TIMEOUT = 60


def _admin_credentials() -> tuple[str, str]:
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    text = path.read_text(encoding="utf-8")
    email = re.search(r"(?im)^- Email:\s*`([^`]+)`", text)
    password = re.search(r"(?im)^- Password:\s*`([^`]+)`", text)
    if not email or not password:
        pytest.skip("Admin credentials missing from test_credentials.md")
    return email.group(1), password.group(1)


def _login(email: str, password: str) -> tuple[requests.Session, dict]:
    response = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data.get("access_token"), str) and data["access_token"]
    assert data.get("token_type") == "bearer"
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return session, data["user"]


def _booking_payload(
    branch_id: str,
    label: str,
    start: str,
    end: str,
    *,
    stock_id: str | None = None,
    status: str = "Booked",
    rental_amount: float = 1200,
    advance_paid: float = 300,
) -> dict:
    marker = uuid.uuid4().hex[:8]
    return {
        "branch_id": branch_id,
        "stock_id": stock_id,
        "product_code": f"TEST_I7_{label}_{marker}",
        "product_name": f"TEST Iteration 7 {label}",
        "booking_date": start,
        "delivery_date": start,
        "return_date": end,
        "rental_amount": rental_amount,
        "total_advance": 500,
        "advance_paid": advance_paid,
        "customer_to_be_paid": max(rental_amount - advance_paid, 0),
        "return_to_be_paid_to_customer": 0,
        "customer": {
            "name": f"TEST I7 Customer {marker}",
            "phone": f"TEST_I7_{marker}",
            "address": "TEST address",
            "id_proof": "TEST-I7-ID",
        },
        "status": status,
        "notes": "TEST iteration 7",
    }


@pytest.fixture(scope="module")
def state():
    email, password = _admin_credentials()
    admin, admin_user = _login(email, password)
    assert admin_user["role"] == "super_admin"

    branches_response = admin.get(f"{API}/branches", timeout=TIMEOUT)
    assert branches_response.status_code == 200, branches_response.text
    branches = {branch["code"]: branch for branch in branches_response.json()}
    assert {"BNG", "KLN"}.issubset(branches), branches.keys()

    # Manager credentials were explicitly supplied in the Iteration 7 review request.
    manager, manager_user = _login("mgr.bng@banglzz.com", "manager123")
    assert manager_user["role"] == "manager"
    assert manager_user["branch_id"] == branches["BNG"]["id"]

    result = {
        "admin": admin,
        "manager": manager,
        "branches": branches,
        "stock_ids": [],
        "booking_ids": [],
    }
    yield result

    for booking_id in reversed(result["booking_ids"]):
        admin.delete(f"{API}/bookings/{booking_id}", timeout=TIMEOUT)
    for stock_id in reversed(result["stock_ids"]):
        admin.delete(f"{API}/stock/{stock_id}", timeout=TIMEOUT)


def _create_stock(state: dict, branch_code: str, label: str) -> dict:
    code = f"TEST_I7_{label}_{uuid.uuid4().hex[:7].upper()}"
    response = state["admin"].post(
        f"{API}/stock",
        json={
            "branch_id": state["branches"][branch_code]["id"],
            "code": code,
            "name": f"TEST Iteration 7 {label}",
            "description": "TEST overlap and schedule stock",
            "notes": "TEST cleanup required",
        },
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    item = response.json()
    assert item["code"] == code and item["branch_id"] == state["branches"][branch_code]["id"]
    state["stock_ids"].append(item["id"])
    return item


def _create_booking(state: dict, branch_code: str, label: str, start: str, end: str, **kwargs) -> requests.Response:
    response = state["admin"].post(
        f"{API}/bookings",
        json=_booking_payload(state["branches"][branch_code]["id"], label, start, end, **kwargs),
        timeout=TIMEOUT,
    )
    if response.status_code == 200:
        state["booking_ids"].append(response.json()["id"])
    return response


# Inclusive overlap protection and branch-prefixed automatic bill numbering.
def test_overlapping_booking_rejected_and_adjacent_range_succeeds(state):
    stock = _create_stock(state, "BNG", "OVERLAP")
    first_response = _create_booking(
        state, "BNG", "FIRST", "2026-08-01", "2026-08-05", stock_id=stock["id"]
    )
    assert first_response.status_code == 200, first_response.text
    first = first_response.json()
    assert re.fullmatch(r"BNG-\d{4,}", first["bill_no"]), first["bill_no"]

    overlapping = _create_booking(
        state, "BNG", "CONFLICT", "2026-08-04", "2026-08-10", stock_id=stock["id"]
    )
    assert overlapping.status_code == 409, overlapping.text
    detail = overlapping.json()["detail"]
    assert first["bill_no"] in detail
    assert "already booked" in detail.lower()

    adjacent_response = _create_booking(
        state, "BNG", "ADJACENT", "2026-08-06", "2026-08-10", stock_id=stock["id"]
    )
    assert adjacent_response.status_code == 200, adjacent_response.text
    adjacent = adjacent_response.json()
    assert adjacent["booking_date"] == "2026-08-06"
    assert adjacent["stock_id"] == stock["id"]
    assert adjacent["bill_no"].startswith("BNG-")


# Returned reservations are historical and must not block the same stock/date range.
def test_returned_booking_does_not_block_overlap(state):
    stock = _create_stock(state, "BNG", "RETURNED")
    returned_response = _create_booking(
        state,
        "BNG",
        "RETURNED",
        "2026-09-01",
        "2026-09-05",
        stock_id=stock["id"],
        status="Returned",
    )
    assert returned_response.status_code == 200, returned_response.text

    active_response = _create_booking(
        state, "BNG", "AFTER_RETURN", "2026-09-03", "2026-09-07", stock_id=stock["id"]
    )
    assert active_response.status_code == 200, active_response.text
    assert active_response.json()["status"] == "Booked"


# Concurrent requests must not both pass the availability check for one stock/range.
def test_concurrent_overlapping_creates_allow_exactly_one_booking(state):
    stock = _create_stock(state, "BNG", "CONCURRENT")
    branch_id = state["branches"]["BNG"]["id"]
    payloads = [
        _booking_payload(
            branch_id,
            f"CONCURRENT_{index}",
            "2026-08-20",
            "2026-08-25",
            stock_id=stock["id"],
        )
        for index in range(8)
    ]
    headers = dict(state["admin"].headers)

    def submit(payload: dict) -> requests.Response:
        return requests.post(f"{API}/bookings", json=payload, headers=headers, timeout=TIMEOUT)

    with ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(submit, payloads))

    successes = [response for response in responses if response.status_code == 200]
    conflicts = [response for response in responses if response.status_code == 409]
    for response in successes:
        state["booking_ids"].append(response.json()["id"])

    assert len(successes) == 1, [
        {"status": response.status_code, "body": response.text[:200]} for response in responses
    ]
    assert len(conflicts) == 7
    winning_bill = successes[0].json()["bill_no"]
    assert all(winning_bill in response.json()["detail"] for response in conflicts)


# Updates check effective dates only when availability-relevant fields change.
def test_update_widening_conflicts_but_notes_only_update_persists(state):
    stock = _create_stock(state, "BNG", "UPDATE")
    early_response = _create_booking(
        state, "BNG", "EARLY", "2026-10-01", "2026-10-03", stock_id=stock["id"]
    )
    later_response = _create_booking(
        state, "BNG", "LATER", "2026-10-10", "2026-10-12", stock_id=stock["id"]
    )
    assert early_response.status_code == later_response.status_code == 200
    early, later = early_response.json(), later_response.json()

    widened = state["admin"].put(
        f"{API}/bookings/{early['id']}", json={"return_date": "2026-10-11"}, timeout=TIMEOUT
    )
    assert widened.status_code == 409, widened.text
    assert later["bill_no"] in widened.json()["detail"]

    notes_update = state["admin"].put(
        f"{API}/bookings/{early['id']}", json={"notes": "TEST I7 non-date update"}, timeout=TIMEOUT
    )
    assert notes_update.status_code == 200, notes_update.text
    assert notes_update.json()["notes"] == "TEST I7 non-date update"
    persisted = state["admin"].get(f"{API}/bookings/{early['id']}", timeout=TIMEOUT)
    assert persisted.status_code == 200
    assert persisted.json()["return_date"] == "2026-10-03"
    assert persisted.json()["notes"] == "TEST I7 non-date update"


# Custom-code bookings without a stock link never participate in stock conflicts.
def test_bookings_without_stock_id_can_overlap(state):
    first = _create_booking(state, "BNG", "CUSTOM_A", "2026-11-01", "2026-11-05")
    second = _create_booking(state, "BNG", "CUSTOM_B", "2026-11-01", "2026-11-05")
    assert first.status_code == second.status_code == 200
    assert first.json()["stock_id"] is None and second.json()["stock_id"] is None
    assert first.json()["bill_no"] != second.json()["bill_no"]


# Stock schedule response structure, calculations, and manager branch scoping.
def test_stock_schedule_shape_totals_and_branch_scope(state):
    bng_stock = _create_stock(state, "BNG", "SCHEDULE_BNG")
    kln_stock = _create_stock(state, "KLN", "SCHEDULE_KLN")
    booking_one = _create_booking(
        state,
        "BNG",
        "SCHEDULE_ONE",
        "2026-05-01",
        "2026-05-03",
        stock_id=bng_stock["id"],
        status="Returned",
        rental_amount=1250,
    )
    booking_two = _create_booking(
        state,
        "BNG",
        "SCHEDULE_TWO",
        "2026-06-10",
        "2026-06-14",
        stock_id=bng_stock["id"],
        status="Returned",
        rental_amount=2750,
    )
    assert booking_one.status_code == booking_two.status_code == 200

    response = state["admin"].get(f"{API}/stock/{bng_stock['id']}/schedule", timeout=TIMEOUT)
    assert response.status_code == 200, response.text
    data = response.json()
    assert set(data) == {
        "stock",
        "bookings",
        "upcoming",
        "series",
        "total_bookings",
        "total_rented_days",
        "total_revenue",
    }
    assert data["stock"]["id"] == bng_stock["id"]
    assert data["total_bookings"] == 2
    assert data["total_rented_days"] == 8
    assert data["total_revenue"] == 4000
    assert data["upcoming"] == []
    assert len(data["series"]) == 12
    assert all(set(row) == {"month", "total", "advance_paid"} for row in data["series"])
    assert {item["id"] for item in data["bookings"]} == {
        booking_one.json()["id"],
        booking_two.json()["id"],
    }

    manager_own = state["manager"].get(f"{API}/stock/{bng_stock['id']}/schedule", timeout=TIMEOUT)
    manager_cross = state["manager"].get(f"{API}/stock/{kln_stock['id']}/schedule", timeout=TIMEOUT)
    admin_cross = state["admin"].get(f"{API}/stock/{kln_stock['id']}/schedule", timeout=TIMEOUT)
    assert manager_own.status_code == 200
    assert manager_cross.status_code == 404
    assert "not found" in manager_cross.json()["detail"].lower()
    assert admin_cross.status_code == 200 and admin_cross.json()["stock"]["id"] == kln_stock["id"]


# Revenue statistics can drill down from a branch to exactly one stock item.
def test_revenue_stats_stock_filter_excludes_other_stock(state):
    target = _create_stock(state, "BNG", "REVENUE_TARGET")
    other = _create_stock(state, "BNG", "REVENUE_OTHER")
    target_booking = _create_booking(
        state,
        "BNG",
        "REVENUE_TARGET",
        "2026-07-05",
        "2026-07-06",
        stock_id=target["id"],
        status="Returned",
        rental_amount=4321,
        advance_paid=321,
    )
    other_booking = _create_booking(
        state,
        "BNG",
        "REVENUE_OTHER",
        "2026-07-07",
        "2026-07-08",
        stock_id=other["id"],
        status="Returned",
        rental_amount=9876,
        advance_paid=876,
    )
    assert target_booking.status_code == other_booking.status_code == 200

    filtered = state["admin"].get(
        f"{API}/stats/revenue", params={"months": 1, "stock_id": target["id"]}, timeout=TIMEOUT
    )
    assert filtered.status_code == 200, filtered.text
    data = filtered.json()
    assert len(data["series"]) == 1
    row = data["series"][0]
    assert row["month"] == "2026-07"
    assert row["total"] == 4321
    assert row["advance_paid"] == 321
    assert row["BNG"] == 4321
    assert data["branch_codes"] == ["BNG"]


# Bill numbers always derive from the selected booking branch.
def test_kln_booking_uses_kln_bill_prefix(state):
    response = _create_booking(state, "KLN", "KLN_PREFIX", "2026-12-01", "2026-12-02")
    assert response.status_code == 200, response.text
    booking = response.json()
    assert re.fullmatch(r"KLN-\d{4,}", booking["bill_no"]), booking["bill_no"]
    assert booking["branch_id"] == state["branches"]["KLN"]["id"]


# Requested CRUD and list endpoint regression coverage.
def test_auth_booking_crud_and_core_list_regressions(state):
    for path in ("/branches", "/users", "/audit", "/bookings"):
        response = state["admin"].get(f"{API}{path}", timeout=TIMEOUT)
        assert response.status_code == 200, f"{path}: {response.text}"
        assert isinstance(response.json(), list)

    created_response = _create_booking(state, "BNG", "CRUD", "2027-01-03", "2027-01-05")
    assert created_response.status_code == 200, created_response.text
    created = created_response.json()
    fetched = state["admin"].get(f"{API}/bookings/{created['id']}", timeout=TIMEOUT)
    assert fetched.status_code == 200 and fetched.json()["bill_no"] == created["bill_no"]

    updated = state["admin"].put(
        f"{API}/bookings/{created['id']}", json={"notes": "TEST I7 CRUD updated"}, timeout=TIMEOUT
    )
    assert updated.status_code == 200 and updated.json()["notes"] == "TEST I7 CRUD updated"
    persisted = state["admin"].get(f"{API}/bookings/{created['id']}", timeout=TIMEOUT)
    assert persisted.status_code == 200 and persisted.json()["notes"] == "TEST I7 CRUD updated"

    deleted = state["admin"].delete(f"{API}/bookings/{created['id']}", timeout=TIMEOUT)
    assert deleted.status_code == 200 and deleted.json() == {"ok": True}
    assert state["admin"].get(f"{API}/bookings/{created['id']}", timeout=TIMEOUT).status_code == 404
    state["booking_ids"].remove(created["id"])
