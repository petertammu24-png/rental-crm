"""Iteration 6 retest: photo ownership guards, booking unlink semantics, and requested regressions."""
from __future__ import annotations

import re
import uuid
from datetime import date, timedelta
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


def _login(email: str, password: str) -> tuple[requests.Session, str, dict]:
    response = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert isinstance(payload.get("access_token"), str) and payload["access_token"]
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {payload['access_token']}"})
    return session, payload["access_token"], payload["user"]


def _stock_payload(branch_id: str, label: str) -> dict:
    suffix = uuid.uuid4().hex[:8].upper()
    return {
        "branch_id": branch_id,
        "code": f"TEST_I6_{label}_{suffix}",
        "name": f"TEST Iteration 6 {label}",
        "description": "TEST iteration 6 stock",
        "notes": "TEST cleanup required",
    }


def _booking_payload(branch_id: str, stock_id: str | None = None, label: str = "BOOKING") -> dict:
    today = date.today()
    suffix = uuid.uuid4().hex[:8]
    return {
        "branch_id": branch_id,
        "stock_id": stock_id,
        "product_code": f"TEST_I6_{label}_{suffix}",
        "product_name": f"TEST Iteration 6 {label}",
        "booking_date": today.isoformat(),
        "delivery_date": (today + timedelta(days=1)).isoformat(),
        "return_date": (today + timedelta(days=3)).isoformat(),
        "rental_amount": 1250,
        "total_advance": 500,
        "advance_paid": 300,
        "customer_to_be_paid": 950,
        "return_to_be_paid_to_customer": 0,
        "customer": {
            "name": f"TEST Customer {suffix}",
            "phone": f"TEST_I6_{suffix}",
            "address": "TEST address",
            "id_proof": "TEST-ID",
        },
        "status": "Booked",
        "notes": "TEST iteration 6 booking",
    }


@pytest.fixture(scope="module")
def state():
    admin_email, admin_password = _admin_credentials()
    admin, admin_token, _ = _login(admin_email, admin_password)
    # Manager credentials are supplied by the iteration review request.
    manager, manager_token, manager_user = _login("mgr.bng@banglzz.com", "manager123")

    branches_response = admin.get(f"{API}/branches", timeout=TIMEOUT)
    assert branches_response.status_code == 200, branches_response.text
    branches = {item["code"]: item for item in branches_response.json()}
    assert {"BNG", "KLN"}.issubset(branches)
    assert manager_user["branch_id"] == branches["BNG"]["id"]

    result = {
        "admin": admin,
        "admin_token": admin_token,
        "manager": manager,
        "manager_token": manager_token,
        "branches": branches,
        "stock_ids": [],
        "booking_ids": [],
        "photo_refs": [],
    }
    yield result

    for owner_type, owner_id, photo_id in reversed(result["photo_refs"]):
        admin.delete(f"{API}/{owner_type}/{owner_id}/photos/{photo_id}", timeout=TIMEOUT)
    for booking_id in reversed(result["booking_ids"]):
        admin.delete(f"{API}/bookings/{booking_id}", timeout=TIMEOUT)
    for stock_id in reversed(result["stock_ids"]):
        admin.delete(f"{API}/stock/{stock_id}", timeout=TIMEOUT)


def _create_stock(state: dict, branch_code: str, label: str) -> dict:
    response = state["admin"].post(
        f"{API}/stock",
        json=_stock_payload(state["branches"][branch_code]["id"], label),
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    item = response.json()
    state["stock_ids"].append(item["id"])
    return item


def _create_booking(state: dict, branch_code: str, label: str, stock_id: str | None = None) -> dict:
    response = state["admin"].post(
        f"{API}/bookings",
        json=_booking_payload(state["branches"][branch_code]["id"], stock_id, label),
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    item = response.json()
    state["booking_ids"].append(item["id"])
    return item


def _upload_photo(state: dict, owner_type: str, owner_id: str, marker: bytes) -> dict:
    response = state["admin"].post(
        f"{API}/{owner_type}/{owner_id}/photos",
        files={"file": ("iteration6.png", marker, "image/png")},
        timeout=TIMEOUT,
    )
    assert response.status_code == 200, response.text
    photo = response.json()
    state["photo_refs"].append((owner_type, owner_id, photo["id"]))
    return photo


# Exact stock-photo ownership check, including cross-branch destructive-action protection.
def test_stock_photo_cannot_be_deleted_via_unrelated_owned_stock(state):
    stock_a = _create_stock(state, "BNG", "STOCK_A")
    stock_b = _create_stock(state, "KLN", "STOCK_B")
    photo_a = _upload_photo(state, "stock", stock_a["id"], b"TEST_I6_STOCK_A")
    photo_b = _upload_photo(state, "stock", stock_b["id"], b"TEST_I6_STOCK_B")

    attempted = state["manager"].delete(
        f"{API}/stock/{stock_a['id']}/photos/{photo_b['id']}", timeout=TIMEOUT
    )
    assert attempted.status_code == 404, attempted.text
    assert "not found" in attempted.json()["detail"].lower()

    persisted_b = state["admin"].get(f"{API}/stock/{stock_b['id']}", timeout=TIMEOUT)
    assert persisted_b.status_code == 200
    assert [photo["id"] for photo in persisted_b.json()["photos"]] == [photo_b["id"]]
    served_b = requests.get(
        f"{API}/files/{photo_b['id']}", params={"auth": state["admin_token"]}, timeout=TIMEOUT
    )
    assert served_b.status_code == 200 and served_b.content == b"TEST_I6_STOCK_B"
    assert photo_a["id"] != photo_b["id"]


# Booking-photo deletion must bind the photo id to the scoped booking owner.
def test_booking_photo_cannot_be_deleted_via_unrelated_booking(state):
    booking_a = _create_booking(state, "BNG", "BOOKING_A")
    booking_b = _create_booking(state, "KLN", "BOOKING_B")
    _upload_photo(state, "bookings", booking_a["id"], b"TEST_I6_BOOKING_A")
    photo_b = _upload_photo(state, "bookings", booking_b["id"], b"TEST_I6_BOOKING_B")

    attempted = state["manager"].delete(
        f"{API}/bookings/{booking_a['id']}/photos/{photo_b['id']}", timeout=TIMEOUT
    )
    assert attempted.status_code == 404, attempted.text
    assert "not found" in attempted.json()["detail"].lower()

    persisted_b = state["admin"].get(f"{API}/bookings/{booking_b['id']}", timeout=TIMEOUT)
    assert persisted_b.status_code == 200
    assert [photo["id"] for photo in persisted_b.json()["photos"]] == [photo_b["id"]]
    served_b = requests.get(
        f"{API}/files/{photo_b['id']}", params={"auth": state["admin_token"]}, timeout=TIMEOUT
    )
    assert served_b.status_code == 200 and served_b.content == b"TEST_I6_BOOKING_B"


# Explicit null unlinks stock, while an omitted stock_id preserves the existing linkage.
def test_booking_stock_unlink_and_omitted_field_patch_semantics(state):
    stock = _create_stock(state, "BNG", "UNLINK_STOCK")
    photo = _upload_photo(state, "stock", stock["id"], b"TEST_I6_UNLINK_STOCK")
    booking = _create_booking(state, "BNG", "UNLINK_BOOKING", stock["id"])
    assert booking["stock_id"] == stock["id"]
    assert [item["id"] for item in booking["stock_photos"]] == [photo["id"]]

    omitted = state["admin"].put(
        f"{API}/bookings/{booking['id']}", json={"notes": "TEST stock_id omitted"}, timeout=TIMEOUT
    )
    assert omitted.status_code == 200, omitted.text
    assert omitted.json()["stock_id"] == stock["id"]
    omitted_get = state["admin"].get(f"{API}/bookings/{booking['id']}", timeout=TIMEOUT)
    assert omitted_get.status_code == 200
    assert omitted_get.json()["stock_id"] == stock["id"]
    assert [item["id"] for item in omitted_get.json()["stock_photos"]] == [photo["id"]]

    unlinked = state["admin"].put(
        f"{API}/bookings/{booking['id']}", json={"stock_id": None}, timeout=TIMEOUT
    )
    assert unlinked.status_code == 200, unlinked.text
    assert unlinked.json()["stock_id"] is None and unlinked.json()["stock_photos"] == []
    unlinked_get = state["admin"].get(f"{API}/bookings/{booking['id']}", timeout=TIMEOUT)
    assert unlinked_get.status_code == 200
    assert unlinked_get.json()["stock_id"] is None and unlinked_get.json()["stock_photos"] == []


# Regression sanity for stock/booking CRUD, invoice photos, and audit list.
def test_requested_regression_sanity(state):
    stock = _create_stock(state, "BNG", "REGRESSION_STOCK")
    fetched_stock = state["admin"].get(f"{API}/stock/{stock['id']}", timeout=TIMEOUT)
    assert fetched_stock.status_code == 200 and fetched_stock.json()["code"] == stock["code"]
    updated_stock = state["admin"].put(
        f"{API}/stock/{stock['id']}", json={"name": "TEST Iteration 6 Updated Stock"}, timeout=TIMEOUT
    )
    assert updated_stock.status_code == 200 and updated_stock.json()["name"] == "TEST Iteration 6 Updated Stock"

    booking = _create_booking(state, "BNG", "REGRESSION_BOOKING", stock["id"])
    fetched_booking = state["admin"].get(f"{API}/bookings/{booking['id']}", timeout=TIMEOUT)
    assert fetched_booking.status_code == 200 and fetched_booking.json()["stock_id"] == stock["id"]
    updated_booking = state["admin"].put(
        f"{API}/bookings/{booking['id']}", json={"status": "Delivered"}, timeout=TIMEOUT
    )
    assert updated_booking.status_code == 200 and updated_booking.json()["status"] == "Delivered"

    invoice_photo = _upload_photo(state, "bookings", booking["id"], b"TEST_I6_INVOICE_PHOTO")
    booking_with_photo = state["admin"].get(f"{API}/bookings/{booking['id']}", timeout=TIMEOUT)
    assert booking_with_photo.status_code == 200
    assert [item["id"] for item in booking_with_photo.json()["photos"]] == [invoice_photo["id"]]
    served = requests.get(
        f"{API}/files/{invoice_photo['id']}", params={"auth": state["admin_token"]}, timeout=TIMEOUT
    )
    assert served.status_code == 200 and served.content == b"TEST_I6_INVOICE_PHOTO"

    audit = state["admin"].get(f"{API}/audit", params={"search": stock["code"]}, timeout=TIMEOUT)
    assert audit.status_code == 200 and isinstance(audit.json(), list)
    assert any(entry.get("entity_id") == stock["id"] for entry in audit.json())

    state["admin"].delete(
        f"{API}/bookings/{booking['id']}/photos/{invoice_photo['id']}", timeout=TIMEOUT
    )
    state["photo_refs"].remove(("bookings", booking["id"], invoice_photo["id"]))
    deleted_booking = state["admin"].delete(f"{API}/bookings/{booking['id']}", timeout=TIMEOUT)
    assert deleted_booking.status_code == 200 and deleted_booking.json() == {"ok": True}
    assert state["admin"].get(f"{API}/bookings/{booking['id']}", timeout=TIMEOUT).status_code == 404
    state["booking_ids"].remove(booking["id"])

    deleted_stock = state["admin"].delete(f"{API}/stock/{stock['id']}", timeout=TIMEOUT)
    assert deleted_stock.status_code == 200 and deleted_stock.json() == {"ok": True}
    assert state["admin"].get(f"{API}/stock/{stock['id']}", timeout=TIMEOUT).status_code == 404
    state["stock_ids"].remove(stock["id"])
