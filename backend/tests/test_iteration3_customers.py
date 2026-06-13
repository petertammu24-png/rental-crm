"""Iteration 3: tests for /api/customers aggregation, branch scoping, search, auth."""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') + '/api'

ADMIN_EMAIL = "admin@jewel.com"
ADMIN_PASSWORD = "admin123"
MGR_BNG_EMAIL = "mgr.bng@banglzz.com"
MGR_BNG_PASSWORD = "manager123"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def branches(admin_token):
    r = requests.get(f"{BASE_URL}/branches", headers=_auth(admin_token))
    assert r.status_code == 200
    items = r.json()
    by_code = {b["code"]: b for b in items}
    assert "BNG" in by_code and "KLN" in by_code, f"expected BNG and KLN, got {list(by_code)}"
    return by_code


@pytest.fixture(scope="module")
def mgr_bng_token():
    return _login(MGR_BNG_EMAIL, MGR_BNG_PASSWORD)


# Unique TEST_ phone numbers per run
RUN = uuid.uuid4().hex[:6].upper()
PHONE_MULTI = f"TEST{RUN}MULTI"   # one customer in BOTH BNG and KLN
PHONE_BNG_ONLY = f"TEST{RUN}BNGONLY"
PHONE_KLN_ONLY = f"TEST{RUN}KLNONLY"

CREATED_IDS = []


@pytest.fixture(scope="module", autouse=True)
def seed_bookings(admin_token, branches):
    """Seed: 2 bookings for PHONE_MULTI (BNG + KLN), 1 for PHONE_BNG_ONLY, 1 for PHONE_KLN_ONLY."""
    bng_id = branches["BNG"]["id"]
    kln_id = branches["KLN"]["id"]

    def mk(branch_id, phone, name, rental, advance_paid, status="Booked",
           customer_to_be_paid=0, refund=0, booking_date="2026-01-10"):
        body = {
            "branch_id": branch_id,
            "product_code": f"TEST_P_{uuid.uuid4().hex[:6]}",
            "product_name": "Test Set",
            "booking_date": booking_date,
            "delivery_date": booking_date,
            "return_date": "2026-01-20",
            "rental_amount": rental,
            "total_advance": 500,
            "advance_paid": advance_paid,
            "customer_to_be_paid": customer_to_be_paid,
            "return_to_be_paid_to_customer": refund,
            "status": status,
            "notes": "TEST_iter3",
            "customer": {"name": name, "phone": phone, "address": "TEST addr", "id_proof": "ID-TEST"},
        }
        r = requests.post(f"{BASE_URL}/bookings", json=body, headers=_auth(admin_token))
        assert r.status_code == 200, r.text
        CREATED_IDS.append(r.json()["id"])
        return r.json()

    # Customer who books in BOTH branches
    mk(bng_id, PHONE_MULTI, "TEST Multi One", 1000, 200, booking_date="2026-01-05",
       customer_to_be_paid=300)
    mk(kln_id, PHONE_MULTI, "TEST Multi One", 2000, 500, booking_date="2026-01-12",
       customer_to_be_paid=100, refund=50)

    # BNG only
    mk(bng_id, PHONE_BNG_ONLY, "TEST BngOnly", 800, 100, booking_date="2026-01-07")
    # KLN only
    mk(kln_id, PHONE_KLN_ONLY, "TEST KlnOnly", 600, 600, status="Returned",
       booking_date="2026-01-03")

    yield

    # Cleanup
    for bid in CREATED_IDS:
        requests.delete(f"{BASE_URL}/bookings/{bid}", headers=_auth(admin_token))


# ---------- Auth ----------
def test_customers_requires_auth():
    r = requests.get(f"{BASE_URL}/customers")
    assert r.status_code in (401, 403)


# ---------- Aggregation ----------
def test_customers_aggregates_multi_branch(admin_token, branches):
    r = requests.get(f"{BASE_URL}/customers", headers=_auth(admin_token))
    assert r.status_code == 200
    data = r.json()
    by_phone = {c["phone"]: c for c in data}
    assert PHONE_MULTI in by_phone, f"Missing {PHONE_MULTI}; got phones {list(by_phone)[:10]}"
    c = by_phone[PHONE_MULTI]
    assert c["total_bookings"] == 2
    assert c["total_rental"] == 3000.0
    assert c["total_advance_paid"] == 700.0
    # Outstanding: both bookings non-returned, customer_to_be_paid 300+100=400, refund 50
    assert c["outstanding_to_collect"] == 400.0
    assert c["outstanding_to_refund"] == 50.0
    assert c["last_booking_date"] == "2026-01-12"
    assert set(c["branch_ids"]) == {branches["BNG"]["id"], branches["KLN"]["id"]}
    assert len(c["bookings"]) == 2
    # Bookings sorted desc by booking_date
    assert c["bookings"][0]["booking_date"] >= c["bookings"][1]["booking_date"]
    # Booking list shape
    b0 = c["bookings"][0]
    for k in ("id", "bill_no", "branch_id", "product_code", "product_name",
              "booking_date", "delivery_date", "return_date", "rental_amount", "status"):
        assert k in b0, f"missing key {k} in booking row"


def test_customers_aggregate_fields(admin_token):
    r = requests.get(f"{BASE_URL}/customers", headers=_auth(admin_token))
    data = r.json()
    by_phone = {c["phone"]: c for c in data}
    c = by_phone[PHONE_BNG_ONLY]
    assert c["name"] == "TEST BngOnly"
    assert c["address"] == "TEST addr"
    assert c["id_proof"] == "ID-TEST"
    assert c["total_bookings"] == 1
    assert len(c["branch_ids"]) == 1


# ---------- Search ----------
def test_customers_search_by_phone(admin_token):
    # search by partial phone substring
    r = requests.get(f"{BASE_URL}/customers", headers=_auth(admin_token),
                     params={"search": PHONE_BNG_ONLY[-8:]})
    assert r.status_code == 200
    phones = [c["phone"] for c in r.json()]
    assert PHONE_BNG_ONLY in phones


def test_customers_search_by_name_case_insensitive(admin_token):
    r = requests.get(f"{BASE_URL}/customers", headers=_auth(admin_token),
                     params={"search": "test multi"})
    assert r.status_code == 200
    phones = [c["phone"] for c in r.json()]
    assert PHONE_MULTI in phones


# ---------- Branch scoping ----------
def test_customers_super_admin_sees_all(admin_token):
    r = requests.get(f"{BASE_URL}/customers", headers=_auth(admin_token))
    phones = {c["phone"] for c in r.json()}
    assert {PHONE_MULTI, PHONE_BNG_ONLY, PHONE_KLN_ONLY}.issubset(phones)


def test_customers_super_admin_branch_filter(admin_token, branches):
    bng_id = branches["BNG"]["id"]
    r = requests.get(f"{BASE_URL}/customers", headers=_auth(admin_token),
                     params={"branch_id": bng_id})
    assert r.status_code == 200
    phones = {c["phone"] for c in r.json()}
    # PHONE_MULTI booked in BNG too -> should appear (filtered to BNG bookings only)
    assert PHONE_MULTI in phones
    assert PHONE_BNG_ONLY in phones
    assert PHONE_KLN_ONLY not in phones
    # When filtered to BNG, the multi-branch customer should have only their BNG booking
    by_phone = {c["phone"]: c for c in r.json()}
    multi = by_phone[PHONE_MULTI]
    assert multi["total_bookings"] == 1
    assert multi["branch_ids"] == [bng_id]


def test_customers_manager_scoped_to_own_branch(mgr_bng_token, branches):
    r = requests.get(f"{BASE_URL}/customers", headers=_auth(mgr_bng_token))
    assert r.status_code == 200
    phones = {c["phone"] for c in r.json()}
    assert PHONE_BNG_ONLY in phones
    assert PHONE_MULTI in phones  # had a booking in BNG
    assert PHONE_KLN_ONLY not in phones
    # Manager's view of multi customer should only show BNG booking
    by_phone = {c["phone"]: c for c in r.json()}
    assert by_phone[PHONE_MULTI]["total_bookings"] == 1
    assert by_phone[PHONE_MULTI]["branch_ids"] == [branches["BNG"]["id"]]


# ---------- Regression sanity ----------
def test_regression_branches(admin_token):
    r = requests.get(f"{BASE_URL}/branches", headers=_auth(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list) and len(r.json()) >= 2


def test_regression_bookings(admin_token):
    r = requests.get(f"{BASE_URL}/bookings", headers=_auth(admin_token))
    assert r.status_code == 200


def test_regression_users(admin_token):
    r = requests.get(f"{BASE_URL}/users", headers=_auth(admin_token))
    assert r.status_code == 200


def test_regression_auth_me(admin_token):
    r = requests.get(f"{BASE_URL}/auth/me", headers=_auth(admin_token))
    assert r.status_code == 200
    assert r.json()["role"] == "super_admin"


def test_regression_dashboard(admin_token):
    r = requests.get(f"{BASE_URL}/stats/dashboard", headers=_auth(admin_token))
    assert r.status_code == 200
    d = r.json()
    assert "total_bookings" in d
