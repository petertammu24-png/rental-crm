"""
Iteration 2: Banglzz & Kalyani Covering CRM — multi-tenancy, RBAC, per-branch bill numbers.
Covers: branches CRUD, users CRUD with manager/staff scoping, bookings access control,
and per-branch bill counters (BNG-0001 / KLN-0001).
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@jewel.com"
ADMIN_PASSWORD = "admin123"

BNG_ID = "535210a2-b7c5-4e2b-a926-f1e1af7664bc"   # code BNG
KLN_ID = "6a2d4fb3-b5d3-4b05-9292-b51f6893ec90"   # code KLN


# -------------- helpers --------------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


def _client(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


def _unique(prefix="x"):
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def _booking_payload(branch_id=None, suffix="A"):
    today = date.today()
    p = {
        "product_code": f"TEST-{suffix}-{uuid.uuid4().hex[:5]}",
        "product_name": f"TEST {suffix}",
        "booking_date": today.isoformat(),
        "delivery_date": (today + timedelta(days=1)).isoformat(),
        "return_date": (today + timedelta(days=4)).isoformat(),
        "rental_amount": 1000, "total_advance": 500, "advance_paid": 500,
        "customer_to_be_paid": 500, "return_to_be_paid_to_customer": 0,
        "customer": {"name": f"TEST_C_{suffix}", "phone": "9000000001", "address": "x", "id_proof": "x"},
        "status": "Booked", "notes": "test",
    }
    if branch_id is not None:
        p["branch_id"] = branch_id
    return p


# -------------- session-scoped fixtures --------------
@pytest.fixture(scope="session")
def admin_client():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return _client(r.json()["access_token"])


@pytest.fixture(scope="session")
def state():
    """Mutable bag for cross-test state and cleanup tracking."""
    return {
        "branches": [],   # created branch ids
        "users": [],      # created user ids
        "bookings": [],   # created booking ids
        "manager_email": f"TEST_mgr_{_unique()}@bngtest.com",
        "manager_password": "Manager#1",
        "staff_email": f"TEST_stf_{_unique()}@bngtest.com",
        "staff_password": "Staff#1",
        "kln_mgr_email": f"TEST_klnmgr_{_unique()}@klntest.com",
        "kln_mgr_password": "Klnmgr#1",
    }


# ==================== BRANCHES ====================
class TestBranches:
    def test_super_admin_create_branch(self, admin_client, state):
        code = f"T{uuid.uuid4().hex[:3].upper()}"
        r = admin_client.post(f"{API}/branches", json={"name": "TEST Branch", "code": code, "address": "addr", "phone": "1"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["code"] == code
        assert body["name"] == "TEST Branch"
        assert "id" in body
        state["branches"].append(body["id"])
        state["test_branch_id"] = body["id"]
        state["test_branch_code"] = code

    def test_duplicate_branch_code_rejected(self, admin_client, state):
        code = state["test_branch_code"]
        r = admin_client.post(f"{API}/branches", json={"name": "Dup", "code": code})
        assert r.status_code == 400

    def test_update_branch(self, admin_client, state):
        bid = state["test_branch_id"]
        r = admin_client.put(f"{API}/branches/{bid}", json={"name": "TEST Branch Renamed"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST Branch Renamed"

    def test_list_branches(self, admin_client):
        r = admin_client.get(f"{API}/branches")
        assert r.status_code == 200
        codes = {b["code"] for b in r.json()}
        assert {"BNG", "KLN"}.issubset(codes)

    def test_delete_empty_branch(self, admin_client, state):
        # create temp branch, then delete it (no users/bookings attached)
        code = f"Z{uuid.uuid4().hex[:3].upper()}"
        r = admin_client.post(f"{API}/branches", json={"name": "TEST Temp", "code": code})
        assert r.status_code == 200
        bid = r.json()["id"]
        rd = admin_client.delete(f"{API}/branches/{bid}")
        assert rd.status_code == 200

    def test_branch_create_requires_super_admin(self, admin_client, state):
        # create a manager and ensure manager cannot create branches
        r = admin_client.post(f"{API}/users", json={
            "email": state["manager_email"], "password": state["manager_password"],
            "name": "TEST Manager", "role": "manager", "branch_id": BNG_ID,
        })
        assert r.status_code == 200, r.text
        state["users"].append(r.json()["id"])
        state["manager_id"] = r.json()["id"]

        mgr_login = _login(state["manager_email"], state["manager_password"])
        assert mgr_login.status_code == 200
        mgr = _client(mgr_login.json()["access_token"])
        state["mgr_token"] = mgr_login.json()["access_token"]

        r2 = mgr.post(f"{API}/branches", json={"name": "Nope", "code": "NOPE"})
        assert r2.status_code == 403


# ==================== USERS ====================
class TestUsers:
    def test_super_admin_creates_manager(self, admin_client, state):
        # already created in TestBranches above — verify role & branch
        r = admin_client.get(f"{API}/users")
        assert r.status_code == 200
        mgr = next((u for u in r.json() if u["id"] == state["manager_id"]), None)
        assert mgr and mgr["role"] == "manager" and mgr["branch_id"] == BNG_ID

    def test_duplicate_email_rejected(self, admin_client, state):
        r = admin_client.post(f"{API}/users", json={
            "email": state["manager_email"], "password": "x", "name": "dup",
            "role": "staff", "branch_id": BNG_ID,
        })
        assert r.status_code == 400

    def test_create_staff_by_super(self, admin_client, state):
        r = admin_client.post(f"{API}/users", json={
            "email": state["staff_email"], "password": state["staff_password"],
            "name": "TEST Staff", "role": "staff", "branch_id": BNG_ID,
        })
        assert r.status_code == 200, r.text
        state["users"].append(r.json()["id"])
        state["staff_id"] = r.json()["id"]
        assert r.json()["role"] == "staff" and r.json()["branch_id"] == BNG_ID

    def test_manager_lists_only_own_branch(self, state):
        mgr = _client(state["mgr_token"])
        r = mgr.get(f"{API}/users")
        assert r.status_code == 200
        users = r.json()
        # must include both manager + staff we created (both BNG); must not include any KLN/super_admin
        assert all(u.get("branch_id") == BNG_ID for u in users), [u for u in users if u.get("branch_id") != BNG_ID]
        ids = {u["id"] for u in users}
        assert state["manager_id"] in ids and state["staff_id"] in ids

    def test_manager_cannot_create_manager(self, state):
        mgr = _client(state["mgr_token"])
        r = mgr.post(f"{API}/users", json={
            "email": f"TEST_mgr2_{_unique()}@x.com", "password": "x",
            "name": "x", "role": "manager", "branch_id": BNG_ID,
        })
        assert r.status_code == 403

    def test_manager_creates_staff_in_own_branch(self, state):
        mgr = _client(state["mgr_token"])
        email = f"TEST_mgrstaff_{_unique()}@x.com"
        r = mgr.post(f"{API}/users", json={
            "email": email, "password": "x", "name": "x", "role": "staff",
            "branch_id": KLN_ID,  # tries to specify different branch — should be overridden to own
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["role"] == "staff"
        assert body["branch_id"] == BNG_ID  # forced to manager's own branch
        state["users"].append(body["id"])

    def test_manager_cannot_modify_outside_branch(self, admin_client, state):
        # create a KLN user via super admin
        r = admin_client.post(f"{API}/users", json={
            "email": state["kln_mgr_email"], "password": state["kln_mgr_password"],
            "name": "TEST KLN MGR", "role": "manager", "branch_id": KLN_ID,
        })
        assert r.status_code == 200
        kln_id = r.json()["id"]
        state["users"].append(kln_id)
        state["kln_mgr_id"] = kln_id

        mgr = _client(state["mgr_token"])
        ru = mgr.put(f"{API}/users/{kln_id}", json={"name": "hack"})
        assert ru.status_code == 403
        rd = mgr.delete(f"{API}/users/{kln_id}")
        assert rd.status_code == 403


# ==================== BOOKINGS RBAC + PER-BRANCH BILL ====================
class TestBookingsRBAC:
    def test_per_branch_bill_counter(self, admin_client, state):
        # create one booking in BNG and one in KLN (via super_admin)
        r1 = admin_client.post(f"{API}/bookings", json=_booking_payload(branch_id=BNG_ID, suffix="BNGa"))
        r2 = admin_client.post(f"{API}/bookings", json=_booking_payload(branch_id=BNG_ID, suffix="BNGb"))
        r3 = admin_client.post(f"{API}/bookings", json=_booking_payload(branch_id=KLN_ID, suffix="KLNa"))
        assert r1.status_code == 200 and r2.status_code == 200 and r3.status_code == 200, (r1.text, r2.text, r3.text)
        b1, b2, b3 = r1.json(), r2.json(), r3.json()
        state["bookings"].extend([b1["id"], b2["id"], b3["id"]])
        assert b1["bill_no"].startswith("BNG-") and b2["bill_no"].startswith("BNG-")
        assert b3["bill_no"].startswith("KLN-")
        # sequence: b2's number > b1's number
        s1 = int(b1["bill_no"].split("-")[1])
        s2 = int(b2["bill_no"].split("-")[1])
        assert s2 == s1 + 1
        # b3 KLN counter independent of BNG
        s3 = int(b3["bill_no"].split("-")[1])
        assert s3 >= 1  # independent counter

    def test_super_admin_must_send_branch_id(self, admin_client):
        r = admin_client.post(f"{API}/bookings", json=_booking_payload(branch_id=None, suffix="NB"))
        assert r.status_code == 400

    def test_staff_cannot_update_or_delete(self, state):
        login = _login(state["staff_email"], state["staff_password"])
        assert login.status_code == 200
        staff = _client(login.json()["access_token"])
        state["staff_token"] = login.json()["access_token"]

        # staff CAN create a booking; branch_id auto-set
        r = staff.post(f"{API}/bookings", json=_booking_payload(branch_id=None, suffix="STF"))
        assert r.status_code == 200, r.text
        sb = r.json()
        state["bookings"].append(sb["id"])
        assert sb["branch_id"] == BNG_ID
        assert sb["bill_no"].startswith("BNG-")

        # staff CANNOT update
        ru = staff.put(f"{API}/bookings/{sb['id']}", json={"status": "Returned"})
        assert ru.status_code == 403
        # staff CANNOT delete
        rd = staff.delete(f"{API}/bookings/{sb['id']}")
        assert rd.status_code == 403

    def test_manager_scoped_listing_and_filter(self, admin_client, state):
        # super_admin sees all branches
        r = admin_client.get(f"{API}/bookings")
        assert r.status_code == 200
        all_items = r.json()
        bng_count = sum(1 for b in all_items if b.get("branch_id") == BNG_ID)
        kln_count = sum(1 for b in all_items if b.get("branch_id") == KLN_ID)
        assert bng_count >= 2 and kln_count >= 1

        # manager (BNG) sees only BNG
        mgr = _client(state["mgr_token"])
        rm = mgr.get(f"{API}/bookings")
        assert rm.status_code == 200
        assert all(b.get("branch_id") == BNG_ID for b in rm.json())

        # super_admin branch filter
        rf = admin_client.get(f"{API}/bookings", params={"branch_id": KLN_ID})
        assert rf.status_code == 200
        assert all(b.get("branch_id") == KLN_ID for b in rf.json())

    def test_dashboard_scoped(self, admin_client, state):
        # super_admin can pass branch_id
        r = admin_client.get(f"{API}/stats/dashboard", params={"branch_id": KLN_ID})
        assert r.status_code == 200
        # manager auto-scoped
        mgr = _client(state["mgr_token"])
        rm = mgr.get(f"{API}/stats/dashboard")
        assert rm.status_code == 200
        # staff also
        stf = _client(state["staff_token"])
        rs = stf.get(f"{API}/stats/dashboard")
        assert rs.status_code == 200


# ==================== BRANCH DELETE GUARDS ====================
class TestBranchDeleteGuards:
    def test_cannot_delete_branch_with_users(self, admin_client):
        r = admin_client.delete(f"{API}/branches/{BNG_ID}")
        assert r.status_code == 400  # has users (manager/staff we created)

    def test_cannot_delete_branch_with_bookings_only(self, admin_client, state):
        # Create a branch then add only a booking (no user) to it
        code = f"B{uuid.uuid4().hex[:3].upper()}"
        rb = admin_client.post(f"{API}/branches", json={"name": "TEST OnlyBookings", "code": code})
        assert rb.status_code == 200
        bid = rb.json()["id"]
        state["branches"].append(bid)
        rc = admin_client.post(f"{API}/bookings", json=_booking_payload(branch_id=bid, suffix="OB"))
        assert rc.status_code == 200
        state["bookings"].append(rc.json()["id"])
        rd = admin_client.delete(f"{API}/branches/{bid}")
        assert rd.status_code == 400


# ==================== ZZ CLEANUP ====================
def test_zz_cleanup(admin_client, state):
    # delete bookings
    for bid in state.get("bookings", []):
        try: admin_client.delete(f"{API}/bookings/{bid}")
        except Exception: pass
    # delete users
    for uid in state.get("users", []):
        try: admin_client.delete(f"{API}/users/{uid}")
        except Exception: pass
    # delete branches (now empty)
    for brid in state.get("branches", []):
        try: admin_client.delete(f"{API}/branches/{brid}")
        except Exception: pass
