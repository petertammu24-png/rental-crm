"""
Jewellery Rental CRM — Backend regression tests.
Covers: auth, bookings CRUD (auto-gen bill_no, duplicates, search/filter), and dashboard stats.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gem-booking-track.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@jewel.com"
ADMIN_PASSWORD = "admin123"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(api_client):
    r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_client(api_client, auth_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"})
    return s


@pytest.fixture(scope="session")
def created_ids():
    return []


def _booking_payload(bill_no=None, suffix="A", status="Booked"):
    today = date.today()
    return {
        "bill_no": bill_no,
        "product_code": f"TEST-PC-{suffix}-{uuid.uuid4().hex[:6]}",
        "product_name": f"TEST Necklace {suffix}",
        "booking_date": today.isoformat(),
        "delivery_date": (today + timedelta(days=1)).isoformat(),
        "return_date": (today + timedelta(days=5)).isoformat(),
        "rental_amount": 5000,
        "total_advance": 2000,
        "advance_paid": 1500,
        "customer_to_be_paid": 3500,
        "return_to_be_paid_to_customer": 500,
        "customer": {
            "name": f"TEST_Customer_{suffix}",
            "phone": f"9000000{suffix[0]}11",
            "address": "Test Lane",
            "id_proof": "AADHAAR-XXXX",
        },
        "status": status,
        "notes": "TEST booking",
    }


# ---------------- Auth ----------------
class TestAuth:
    def test_login_success(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data and isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == ADMIN_EMAIL

    def test_login_invalid(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_token(self, auth_client):
        r = auth_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert "password_hash" not in d
        assert "_id" not in d

    def test_me_without_token(self, api_client):
        r = api_client.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Bookings CRUD ----------------
class TestBookings:
    def test_create_with_auto_bill_no(self, auth_client, created_ids):
        r = auth_client.post(f"{API}/bookings", json=_booking_payload(suffix="AUTO"))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["bill_no"].startswith("BILL-") and len(b["bill_no"]) == 9
        assert b["id"]
        assert "_id" not in b
        created_ids.append(b["id"])

    def test_create_with_explicit_bill_no(self, auth_client, created_ids):
        bill = f"TEST-BILL-{uuid.uuid4().hex[:6].upper()}"
        r = auth_client.post(f"{API}/bookings", json=_booking_payload(bill_no=bill, suffix="EXP"))
        assert r.status_code == 200
        assert r.json()["bill_no"] == bill
        created_ids.append(r.json()["id"])
        # duplicate
        r2 = auth_client.post(f"{API}/bookings", json=_booking_payload(bill_no=bill, suffix="DUP"))
        assert r2.status_code == 400
        assert "exist" in r2.json()["detail"].lower()

    def test_create_requires_auth(self, api_client):
        r = api_client.post(f"{API}/bookings", json=_booking_payload(suffix="NA"))
        assert r.status_code == 401

    def test_list_search_and_status_filter(self, auth_client, created_ids):
        # create a known booking to search
        unique = f"TESTSEARCH{uuid.uuid4().hex[:5].upper()}"
        payload = _booking_payload(suffix="SR", status="Delivered")
        payload["product_code"] = unique
        r = auth_client.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200
        created_ids.append(r.json()["id"])

        # search by product_code
        rs = auth_client.get(f"{API}/bookings", params={"search": unique})
        assert rs.status_code == 200
        items = rs.json()
        assert any(b["product_code"] == unique for b in items)

        # status filter
        rd = auth_client.get(f"{API}/bookings", params={"status": "Delivered"})
        assert rd.status_code == 200
        assert all(b["status"] == "Delivered" for b in rd.json())

        # search by customer name
        rc = auth_client.get(f"{API}/bookings", params={"search": payload["customer"]["name"]})
        assert rc.status_code == 200
        assert any(b["customer"]["name"] == payload["customer"]["name"] for b in rc.json())

    def test_update_and_persist(self, auth_client, created_ids):
        r = auth_client.post(f"{API}/bookings", json=_booking_payload(suffix="UP"))
        assert r.status_code == 200
        bid = r.json()["id"]
        created_ids.append(bid)
        assert r.json()["status"] == "Booked"

        ru = auth_client.put(f"{API}/bookings/{bid}", json={"status": "Delivered", "notes": "Updated"})
        assert ru.status_code == 200
        assert ru.json()["status"] == "Delivered"
        assert ru.json()["notes"] == "Updated"

        rg = auth_client.get(f"{API}/bookings/{bid}")
        assert rg.status_code == 200
        assert rg.json()["status"] == "Delivered"
        assert rg.json()["notes"] == "Updated"

    def test_update_duplicate_bill_no_rejected(self, auth_client, created_ids):
        # create two
        r1 = auth_client.post(f"{API}/bookings", json=_booking_payload(suffix="D1"))
        r2 = auth_client.post(f"{API}/bookings", json=_booking_payload(suffix="D2"))
        assert r1.status_code == 200 and r2.status_code == 200
        b1, b2 = r1.json(), r2.json()
        created_ids.extend([b1["id"], b2["id"]])
        # try to set b2's bill_no to b1's
        ru = auth_client.put(f"{API}/bookings/{b2['id']}", json={"bill_no": b1["bill_no"]})
        assert ru.status_code == 400

    def test_delete_and_404(self, auth_client):
        r = auth_client.post(f"{API}/bookings", json=_booking_payload(suffix="DEL"))
        assert r.status_code == 200
        bid = r.json()["id"]
        rd = auth_client.delete(f"{API}/bookings/{bid}")
        assert rd.status_code == 200
        rg = auth_client.get(f"{API}/bookings/{bid}")
        assert rg.status_code == 404


# ---------------- Stats ----------------
class TestStats:
    def test_dashboard_stats_shape(self, auth_client):
        r = auth_client.get(f"{API}/stats/dashboard")
        assert r.status_code == 200
        d = r.json()
        expected_keys = {
            "total_bookings", "currently_rented", "upcoming_returns", "overdue",
            "total_rental", "total_advance_collected", "pending_from_customer",
            "pending_to_customer", "overdue_bookings", "upcoming_bookings",
        }
        assert expected_keys.issubset(set(d.keys()))
        assert isinstance(d["overdue_bookings"], list)
        assert isinstance(d["upcoming_bookings"], list)
        assert isinstance(d["total_rental"], (int, float))

    def test_stats_requires_auth(self, api_client):
        r = api_client.get(f"{API}/stats/dashboard")
        assert r.status_code == 401


# ---------------- Cleanup ----------------
def test_zz_cleanup(auth_client, created_ids):
    """Best-effort cleanup of all bookings created during this run."""
    for bid in created_ids:
        try:
            auth_client.delete(f"{API}/bookings/{bid}")
        except Exception:
            pass
