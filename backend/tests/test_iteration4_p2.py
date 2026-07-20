"""Iteration 4 tests: revenue chart, photo uploads, audit log."""
import os
import io
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@jewel.com", "admin123")
MGR = ("mgr.bng@banglzz.com", "manager123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        return None
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(*ADMIN)
    if not tok:
        pytest.skip("Admin login failed")
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def branches(admin_headers):
    r = requests.get(f"{API}/branches", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def bng_branch(branches, admin_headers):
    for b in branches:
        if b["code"] == "BNG":
            return b
    # create if missing
    r = requests.post(f"{API}/branches", headers=admin_headers,
                      json={"name": "Banglzz Main", "code": "BNG"}, timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def mgr_token(admin_headers, bng_branch):
    tok = _login(*MGR)
    if tok:
        return tok
    # Create manager
    r = requests.post(f"{API}/users", headers=admin_headers, json={
        "email": MGR[0], "password": MGR[1], "name": "Manager BNG",
        "role": "manager", "branch_id": bng_branch["id"],
    }, timeout=30)
    assert r.status_code == 200, r.text
    return _login(*MGR)


@pytest.fixture(scope="module")
def mgr_headers(mgr_token):
    if not mgr_token:
        pytest.skip("Manager login failed")
    return {"Authorization": f"Bearer {mgr_token}"}


@pytest.fixture(scope="module")
def staff_creds(admin_headers, bng_branch):
    email = f"test_staff_{uuid.uuid4().hex[:6]}@t.com"
    pw = "staff123"
    r = requests.post(f"{API}/users", headers=admin_headers, json={
        "email": email, "password": pw, "name": "Test Staff",
        "role": "staff", "branch_id": bng_branch["id"],
    }, timeout=30)
    assert r.status_code == 200, r.text
    user = r.json()
    tok = _login(email, pw)
    yield {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}
    requests.delete(f"{API}/users/{user['id']}", headers=admin_headers)


# ---------- Sanity ----------
class TestSanity:
    def test_bookings_get_list(self, admin_headers):
        r = requests.get(f"{API}/bookings", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_branches_get(self, admin_headers):
        r = requests.get(f"{API}/branches", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_users_get(self, admin_headers):
        r = requests.get(f"{API}/users", headers=admin_headers, timeout=30)
        assert r.status_code == 200


# ---------- Revenue stats ----------
class TestRevenue:
    def test_revenue_default(self, admin_headers):
        r = requests.get(f"{API}/stats/revenue?months=12", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "series" in data and "branch_codes" in data
        assert len(data["series"]) == 12
        # chronological, oldest first
        months = [row["month"] for row in data["series"]]
        assert months == sorted(months)
        for row in data["series"]:
            assert "month" in row and "total" in row and "advance_paid" in row

    def test_revenue_current_month_included(self, admin_headers):
        from datetime import datetime, timezone
        r = requests.get(f"{API}/stats/revenue?months=6", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        current = datetime.now(timezone.utc).strftime("%Y-%m")
        assert data["series"][-1]["month"] == current
        assert len(data["series"]) == 6

    def test_revenue_manager_scope(self, mgr_headers, bng_branch, admin_headers):
        # Manager should only see own branch. branch_id filter ignored.
        # Create booking with another branch to ensure isolation is measurable
        r = requests.get(f"{API}/stats/revenue?branch_id=some-other-id", headers=mgr_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Only BNG branch code should appear
        assert data["branch_codes"] == [] or data["branch_codes"] == ["BNG"]

    def test_revenue_unauth(self):
        r = requests.get(f"{API}/stats/revenue", timeout=30)
        assert r.status_code == 401


# ---------- Audit log ----------
class TestAudit:
    def test_audit_requires_auth(self):
        r = requests.get(f"{API}/audit", timeout=30)
        assert r.status_code == 401

    def test_audit_staff_forbidden(self, staff_creds):
        r = requests.get(f"{API}/audit", headers=staff_creds["headers"], timeout=30)
        assert r.status_code == 403

    def test_audit_super_admin_ok(self, admin_headers):
        r = requests.get(f"{API}/audit", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_audit_manager_ok(self, mgr_headers):
        r = requests.get(f"{API}/audit", headers=mgr_headers, timeout=30)
        assert r.status_code == 200

    def test_audit_created_on_booking(self, admin_headers, bng_branch):
        bill = f"AUDT-{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "bill_no": bill,
            "branch_id": bng_branch["id"],
            "product_code": "P01",
            "product_name": "Test",
            "booking_date": "2026-01-15",
            "delivery_date": "2026-01-16",
            "return_date": "2026-01-20",
            "rental_amount": 500,
            "advance_paid": 100,
            "customer": {"name": "Audit Test", "phone": "9999999999"},
        }
        r = requests.post(f"{API}/bookings", headers=admin_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        booking_id = r.json()["id"]
        time.sleep(0.5)
        r = requests.get(f"{API}/audit?entity_type=booking&action=create",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        entries = r.json()
        matched = [e for e in entries if bill in (e.get("summary") or "")]
        assert matched, f"No audit entry for {bill}"
        assert matched[0]["action"] == "create"
        assert matched[0]["entity_type"] == "booking"
        # cleanup
        requests.delete(f"{API}/bookings/{booking_id}", headers=admin_headers)

    def test_audit_filters(self, admin_headers):
        r = requests.get(f"{API}/audit?action=create&entity_type=booking",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        for e in r.json():
            assert e["action"] == "create"
            assert e["entity_type"] == "booking"


# ---------- Photo upload validation (run BEFORE storage call) ----------
class TestPhotoValidation:
    @pytest.fixture(scope="class")
    def test_booking_id(self, admin_headers, bng_branch):
        payload = {
            "bill_no": f"PHOTO-{uuid.uuid4().hex[:6].upper()}",
            "branch_id": bng_branch["id"],
            "product_code": "P01",
            "booking_date": "2026-01-15",
            "delivery_date": "2026-01-16",
            "return_date": "2026-01-20",
            "rental_amount": 500,
            "customer": {"name": "Photo Cust", "phone": "8888888888"},
        }
        r = requests.post(f"{API}/bookings", headers=admin_headers, json=payload, timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        yield bid
        requests.delete(f"{API}/bookings/{bid}", headers=admin_headers)

    def test_reject_bad_content_type(self, admin_headers, test_booking_id):
        files = {"file": ("t.txt", b"hello", "text/plain")}
        r = requests.post(f"{API}/bookings/{test_booking_id}/photos",
                          headers=admin_headers, files=files, timeout=30)
        assert r.status_code == 400
        assert "JPEG" in r.text or "PNG" in r.text or "WebP" in r.text or "allowed" in r.text.lower()

    def test_reject_oversize(self, admin_headers, test_booking_id):
        # 9 MB payload
        big = b"\xff" * (9 * 1024 * 1024)
        files = {"file": ("big.jpg", big, "image/jpeg")}
        r = requests.post(f"{API}/bookings/{test_booking_id}/photos",
                          headers=admin_headers, files=files, timeout=60)
        assert r.status_code == 400
        assert "large" in r.text.lower() or "8" in r.text

    def test_photo_endpoint_requires_auth(self, test_booking_id):
        files = {"file": ("t.jpg", b"aa", "image/jpeg")}
        r = requests.post(f"{API}/bookings/{test_booking_id}/photos", files=files, timeout=30)
        assert r.status_code == 401

    def test_photo_booking_404(self, admin_headers):
        files = {"file": ("t.txt", b"hi", "text/plain")}
        r = requests.post(f"{API}/bookings/does-not-exist/photos",
                          headers=admin_headers, files=files, timeout=30)
        # 404 (not found) - content-type check happens after booking lookup
        assert r.status_code == 404


# ---------- File serve auth ----------
class TestFileServe:
    def test_file_no_auth(self):
        r = requests.get(f"{API}/files/some-id", timeout=30)
        assert r.status_code == 401

    def test_file_invalid_token(self):
        r = requests.get(f"{API}/files/some-id?auth=bad-token", timeout=30)
        assert r.status_code == 401

    def test_file_not_found(self, admin_token):
        r = requests.get(f"{API}/files/nonexistent?auth={admin_token}", timeout=30)
        assert r.status_code == 404


# ---------- Photo delete permission ----------
class TestPhotoDelete:
    def test_staff_cannot_delete(self, staff_creds, admin_headers, bng_branch):
        # Create booking
        payload = {
            "bill_no": f"PDEL-{uuid.uuid4().hex[:6].upper()}",
            "branch_id": bng_branch["id"],
            "product_code": "P01",
            "booking_date": "2026-01-15",
            "delivery_date": "2026-01-16",
            "return_date": "2026-01-20",
            "rental_amount": 100,
            "customer": {"name": "X", "phone": "7777777777"},
        }
        r = requests.post(f"{API}/bookings", headers=admin_headers, json=payload, timeout=30)
        bid = r.json()["id"]
        r = requests.delete(f"{API}/bookings/{bid}/photos/fake-photo-id",
                            headers=staff_creds["headers"], timeout=30)
        assert r.status_code == 403
        requests.delete(f"{API}/bookings/{bid}", headers=admin_headers)


# ---------- Booking regression ----------
class TestBookingRegression:
    def test_create_and_list(self, admin_headers, bng_branch):
        bill = f"REG-{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "bill_no": bill,
            "branch_id": bng_branch["id"],
            "product_code": "P02",
            "booking_date": "2026-01-15",
            "delivery_date": "2026-01-16",
            "return_date": "2026-01-20",
            "rental_amount": 750,
            "customer": {"name": "Reg", "phone": "6666666666"},
        }
        r = requests.post(f"{API}/bookings", headers=admin_headers, json=payload, timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        r = requests.get(f"{API}/bookings/{bid}", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        b = r.json()
        # photos field may or may not exist yet
        assert b["bill_no"] == bill
        requests.delete(f"{API}/bookings/{bid}", headers=admin_headers)
