"""Iteration 5 tests: stock CRUD/RBAC, photos, booking snapshots, file serving, regressions, and auth hardening."""
from __future__ import annotations

import re
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = (FRONTEND_ENV.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing from /app/frontend/.env")
API = f"{BASE_URL}/api"
TIMEOUT = 45


def _credentials_from_memory() -> tuple[str, str]:
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    text = path.read_text(encoding="utf-8")
    email = re.search(r"(?im)^- Email:\s*`([^`]+)`", text)
    password = re.search(r"(?im)^- Password:\s*`([^`]+)`", text)
    if not email or not password:
        pytest.skip("Admin email/password missing from test_credentials.md")
    return email.group(1), password.group(1)


def _login(email: str, password: str) -> requests.Response:
    return requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=TIMEOUT,
    )


def _client(token: str) -> requests.Session:
    client = requests.Session()
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


def _booking_payload(branch_id: str, stock_id: str | None = None, suffix: str = "STOCK") -> dict:
    today = date.today()
    return {
        "branch_id": branch_id,
        "stock_id": stock_id,
        "product_code": f"TEST_{suffix}_{uuid.uuid4().hex[:6]}",
        "product_name": "",
        "booking_date": today.isoformat(),
        "delivery_date": (today + timedelta(days=1)).isoformat(),
        "return_date": (today + timedelta(days=4)).isoformat(),
        "rental_amount": 1000,
        "total_advance": 500,
        "advance_paid": 300,
        "customer_to_be_paid": 700,
        "return_to_be_paid_to_customer": 0,
        "customer": {
            "name": f"TEST_Customer_{suffix}",
            "phone": f"TEST_{uuid.uuid4().hex[:10]}",
            "address": "TEST address",
            "id_proof": "TEST-ID",
        },
        "status": "Booked",
        "notes": "TEST iteration 5",
    }


@pytest.fixture(scope="module")
def qa_state():
    admin_email, admin_password = _credentials_from_memory()
    login = _login(admin_email, admin_password)
    assert login.status_code == 200, f"Admin login failed: {login.status_code} {login.text}"
    login_data = login.json()
    assert isinstance(login_data.get("access_token"), str) and login_data["access_token"]
    admin = _client(login_data["access_token"])

    branch_response = admin.get(f"{API}/branches", timeout=TIMEOUT)
    assert branch_response.status_code == 200, branch_response.text
    by_code = {branch["code"]: branch for branch in branch_response.json()}
    assert {"BNG", "KLN"}.issubset(by_code), f"Missing required branches: {by_code.keys()}"

    manager_login = _login("mgr.bng@banglzz.com", "manager123")
    assert manager_login.status_code == 200, f"Manager login failed: {manager_login.text}"
    manager_data = manager_login.json()
    manager = _client(manager_data["access_token"])
    assert manager_data["user"]["branch_id"] == by_code["BNG"]["id"]

    staff_email = f"test_iter5_staff_{uuid.uuid4().hex[:8]}@example.com"
    staff_password = "TEST_Staff#123"
    created_staff = admin.post(
        f"{API}/users",
        json={
            "email": staff_email,
            "password": staff_password,
            "name": "TEST Iteration 5 Staff",
            "role": "staff",
            "branch_id": by_code["BNG"]["id"],
        },
        timeout=TIMEOUT,
    )
    assert created_staff.status_code == 200, created_staff.text
    staff_login = _login(staff_email, staff_password)
    assert staff_login.status_code == 200, staff_login.text
    staff = _client(staff_login.json()["access_token"])

    state = {
        "admin": admin,
        "admin_token": login_data["access_token"],
        "manager": manager,
        "manager_token": manager_data["access_token"],
        "staff": staff,
        "staff_token": staff_login.json()["access_token"],
        "staff_user": created_staff.json(),
        "staff_email": staff_email,
        "staff_password": staff_password,
        "branches": by_code,
        "stock_ids": [],
        "booking_ids": [],
    }
    yield state

    for booking_id in state["booking_ids"]:
        admin.delete(f"{API}/bookings/{booking_id}", timeout=TIMEOUT)
    for stock_id in state["stock_ids"]:
        admin.delete(f"{API}/stock/{stock_id}", timeout=TIMEOUT)
    admin.delete(f"{API}/users/{created_staff.json()['id']}", timeout=TIMEOUT)


def _create_stock(client: requests.Session, branch_id: str, code: str | None = None, name: str = "TEST Stock") -> requests.Response:
    return client.post(
        f"{API}/stock",
        json={
            "branch_id": branch_id,
            "code": code or f"TEST_STK_{uuid.uuid4().hex[:8].upper()}",
            "name": name,
            "description": "TEST description",
            "notes": "TEST notes",
        },
        timeout=TIMEOUT,
    )


# Stock CRUD, uniqueness, search, tenant scoping, and role permissions.
class TestStockCrudAndRbac:
    def test_admin_requires_branch_and_staff_write_forbidden(self, qa_state):
        no_branch = qa_state["admin"].post(
            f"{API}/stock", json={"code": "TEST_NO_BRANCH", "name": "No branch"}, timeout=TIMEOUT
        )
        assert no_branch.status_code == 400
        assert "branch_id" in no_branch.json()["detail"]

        staff_create = _create_stock(
            qa_state["staff"], qa_state["branches"]["BNG"]["id"], f"TEST_DENIED_{uuid.uuid4().hex[:5]}"
        )
        assert staff_create.status_code == 403
        assert "permission" in staff_create.json()["detail"].lower()

    def test_create_duplicate_update_and_delete_persist(self, qa_state):
        bng_id = qa_state["branches"]["BNG"]["id"]
        code = f"TEST_CRUD_{uuid.uuid4().hex[:8].upper()}"
        created = _create_stock(qa_state["admin"], bng_id, code, "TEST Original")
        assert created.status_code == 200, created.text
        item = created.json()
        qa_state["stock_ids"].append(item["id"])
        assert item["code"] == code and item["name"] == "TEST Original"
        assert item["branch_id"] == bng_id and item["photos"] == []
        assert isinstance(item["id"], str) and "_id" not in item

        fetched = qa_state["admin"].get(f"{API}/stock/{item['id']}", timeout=TIMEOUT)
        assert fetched.status_code == 200 and fetched.json()["code"] == code

        duplicate = _create_stock(qa_state["admin"], bng_id, code, "TEST Duplicate")
        assert duplicate.status_code == 400
        assert "already exists" in duplicate.json()["detail"]

        same_code_other_branch = _create_stock(
            qa_state["admin"], qa_state["branches"]["KLN"]["id"], code, "TEST KLN same code"
        )
        assert same_code_other_branch.status_code == 200, same_code_other_branch.text
        qa_state["stock_ids"].append(same_code_other_branch.json()["id"])

        updated = qa_state["admin"].put(
            f"{API}/stock/{item['id']}",
            json={"name": "TEST Updated", "description": "TEST changed", "notes": "TEST changed note"},
            timeout=TIMEOUT,
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["name"] == "TEST Updated"
        assert updated.json()["branch_id"] == bng_id
        persisted = qa_state["admin"].get(f"{API}/stock/{item['id']}", timeout=TIMEOUT).json()
        assert persisted["name"] == "TEST Updated" and persisted["description"] == "TEST changed"

        staff_update = qa_state["staff"].put(
            f"{API}/stock/{item['id']}", json={"name": "Forbidden"}, timeout=TIMEOUT
        )
        staff_delete = qa_state["staff"].delete(f"{API}/stock/{item['id']}", timeout=TIMEOUT)
        assert staff_update.status_code == 403 and staff_delete.status_code == 403

        deleted = qa_state["admin"].delete(f"{API}/stock/{item['id']}", timeout=TIMEOUT)
        assert deleted.status_code == 200 and deleted.json() == {"ok": True}
        assert qa_state["admin"].get(f"{API}/stock/{item['id']}", timeout=TIMEOUT).status_code == 404
        qa_state["stock_ids"].remove(item["id"])

    def test_manager_auto_branch_and_read_scoping_including_staff(self, qa_state):
        bng_id = qa_state["branches"]["BNG"]["id"]
        kln_id = qa_state["branches"]["KLN"]["id"]
        run = uuid.uuid4().hex[:8].upper()
        manager_created = _create_stock(qa_state["manager"], kln_id, f"TEST_MGR_{run}", "TEST Manager BNG")
        assert manager_created.status_code == 200, manager_created.text
        manager_item = manager_created.json()
        qa_state["stock_ids"].append(manager_item["id"])
        assert manager_item["branch_id"] == bng_id

        kln_created = _create_stock(qa_state["admin"], kln_id, f"TEST_KLN_{run}", "TEST Hidden KLN")
        assert kln_created.status_code == 200, kln_created.text
        kln_item = kln_created.json()
        qa_state["stock_ids"].append(kln_item["id"])

        manager_list = qa_state["manager"].get(f"{API}/stock", timeout=TIMEOUT)
        staff_list = qa_state["staff"].get(f"{API}/stock", timeout=TIMEOUT)
        assert manager_list.status_code == 200 and staff_list.status_code == 200
        assert all(x["branch_id"] == bng_id for x in manager_list.json())
        assert all(x["branch_id"] == bng_id for x in staff_list.json())
        assert manager_item["id"] in {x["id"] for x in staff_list.json()}
        assert kln_item["id"] not in {x["id"] for x in manager_list.json()}
        assert qa_state["manager"].get(f"{API}/stock/{kln_item['id']}", timeout=TIMEOUT).status_code == 404

        filtered = qa_state["admin"].get(f"{API}/stock", params={"branch_id": kln_id}, timeout=TIMEOUT)
        searched = qa_state["admin"].get(f"{API}/stock", params={"search": run}, timeout=TIMEOUT)
        assert filtered.status_code == 200 and all(x["branch_id"] == kln_id for x in filtered.json())
        assert searched.status_code == 200
        assert {manager_item["id"], kln_item["id"]}.issubset({x["id"] for x in searched.json()})


# Stock photo upload validations, serving, deletion, and branch access.
class TestStockPhotos:
    def test_validation_upload_serve_soft_delete_and_permissions(self, qa_state):
        bng_id = qa_state["branches"]["BNG"]["id"]
        created = _create_stock(qa_state["admin"], bng_id, name="TEST Photo Stock")
        assert created.status_code == 200, created.text
        stock = created.json()
        qa_state["stock_ids"].append(stock["id"])
        endpoint = f"{API}/stock/{stock['id']}/photos"

        wrong = qa_state["admin"].post(
            endpoint, files={"file": ("bad.txt", b"not an image", "text/plain")}, timeout=TIMEOUT
        )
        assert wrong.status_code == 400
        assert "JPEG" in wrong.text and "PNG" in wrong.text and "WebP" in wrong.text

        oversized = qa_state["admin"].post(
            endpoint,
            files={"file": ("too-big.jpg", b"x" * (8 * 1024 * 1024 + 1), "image/jpeg")},
            timeout=TIMEOUT,
        )
        assert oversized.status_code == 400 and "large" in oversized.text.lower()

        staff_upload = qa_state["staff"].post(
            endpoint, files={"file": ("staff.png", b"tiny", "image/png")}, timeout=TIMEOUT
        )
        assert staff_upload.status_code == 403

        uploaded = qa_state["manager"].post(
            endpoint, files={"file": ("one.png", b"TEST_IMAGE_BYTES", "image/png")}, timeout=TIMEOUT
        )
        assert uploaded.status_code == 200, uploaded.text
        photo = uploaded.json()
        assert photo["content_type"] == "image/png" and photo["original_filename"] == "one.png"
        assert photo["is_deleted"] is False and isinstance(photo["id"], str)

        fetched = qa_state["admin"].get(f"{API}/stock/{stock['id']}", timeout=TIMEOUT).json()
        assert [x["id"] for x in fetched["photos"]] == [photo["id"]]

        served_admin = requests.get(
            f"{API}/files/{photo['id']}", params={"auth": qa_state["admin_token"]}, timeout=TIMEOUT
        )
        served_staff = requests.get(
            f"{API}/files/{photo['id']}", params={"auth": qa_state["staff_token"]}, timeout=TIMEOUT
        )
        assert served_admin.status_code == 200 and served_admin.content == b"TEST_IMAGE_BYTES"
        assert served_admin.headers["content-type"].startswith("image/png")
        assert served_staff.status_code == 200 and served_staff.content == b"TEST_IMAGE_BYTES"

        staff_delete = qa_state["staff"].delete(f"{endpoint}/{photo['id']}", timeout=TIMEOUT)
        assert staff_delete.status_code == 403
        deleted = qa_state["manager"].delete(f"{endpoint}/{photo['id']}", timeout=TIMEOUT)
        assert deleted.status_code == 200 and deleted.json() == {"ok": True}
        after = qa_state["admin"].get(f"{API}/stock/{stock['id']}", timeout=TIMEOUT).json()
        assert after["photos"] == []
        assert requests.get(
            f"{API}/files/{photo['id']}", params={"auth": qa_state["admin_token"]}, timeout=TIMEOUT
        ).status_code == 404

    def test_max_five_photos(self, qa_state):
        created = _create_stock(qa_state["admin"], qa_state["branches"]["BNG"]["id"], name="TEST Max Photos")
        assert created.status_code == 200, created.text
        stock = created.json()
        qa_state["stock_ids"].append(stock["id"])
        endpoint = f"{API}/stock/{stock['id']}/photos"
        uploaded_ids = []
        for index in range(5):
            response = qa_state["admin"].post(
                endpoint,
                files={"file": (f"{index}.webp", f"TEST_WEBP_{index}".encode(), "image/webp")},
                timeout=TIMEOUT,
            )
            assert response.status_code == 200, response.text
            uploaded_ids.append(response.json()["id"])
        sixth = qa_state["admin"].post(
            endpoint, files={"file": ("sixth.webp", b"TEST_SIXTH", "image/webp")}, timeout=TIMEOUT
        )
        assert sixth.status_code == 400 and "Maximum 5" in sixth.json()["detail"]
        persisted = qa_state["admin"].get(f"{API}/stock/{stock['id']}", timeout=TIMEOUT).json()
        assert [p["id"] for p in persisted["photos"]] == uploaded_ids
    def test_photo_id_cannot_be_deleted_through_unrelated_stock(self, qa_state):
        bng_stock_response = _create_stock(
            qa_state["admin"], qa_state["branches"]["BNG"]["id"], name="TEST BNG Delete Guard"
        )
        kln_stock_response = _create_stock(
            qa_state["admin"], qa_state["branches"]["KLN"]["id"], name="TEST KLN Protected Photo"
        )
        assert bng_stock_response.status_code == kln_stock_response.status_code == 200
        bng_stock, kln_stock = bng_stock_response.json(), kln_stock_response.json()
        qa_state["stock_ids"].extend([bng_stock["id"], kln_stock["id"]])
        upload = qa_state["admin"].post(
            f"{API}/stock/{kln_stock['id']}/photos",
            files={"file": ("protected.png", b"TEST_PROTECTED_CROSS_BRANCH", "image/png")},
            timeout=TIMEOUT,
        )
        assert upload.status_code == 200, upload.text
        photo_id = upload.json()["id"]

        before = requests.get(
            f"{API}/files/{photo_id}", params={"auth": qa_state["manager_token"]}, timeout=TIMEOUT
        )
        assert before.status_code == 403
        attempted_delete = qa_state["manager"].delete(
            f"{API}/stock/{bng_stock['id']}/photos/{photo_id}", timeout=TIMEOUT
        )
        assert attempted_delete.status_code in {403, 404}
        still_served = requests.get(
            f"{API}/files/{photo_id}", params={"auth": qa_state["admin_token"]}, timeout=TIMEOUT
        )
        assert still_served.status_code == 200 and still_served.content == b"TEST_PROTECTED_CROSS_BRANCH"


# Booking linkage snapshots and stock deletion behavior.
class TestBookingStockSnapshots:
    def test_snapshot_resnapshot_invalid_cross_branch_delete_and_file_serve(self, qa_state):
        bng_id = qa_state["branches"]["BNG"]["id"]
        kln_id = qa_state["branches"]["KLN"]["id"]
        first = _create_stock(qa_state["admin"], bng_id, name="TEST Snapshot Original")
        second = _create_stock(qa_state["admin"], bng_id, name="TEST Resnapshot Stock")
        cross = _create_stock(qa_state["admin"], kln_id, name="TEST Cross Branch Stock")
        assert first.status_code == second.status_code == cross.status_code == 200
        first_stock, second_stock, cross_stock = first.json(), second.json(), cross.json()
        qa_state["stock_ids"].extend([first_stock["id"], second_stock["id"], cross_stock["id"]])

        first_upload = qa_state["admin"].post(
            f"{API}/stock/{first_stock['id']}/photos",
            files={"file": ("first.jpg", b"TEST_FIRST_SNAPSHOT", "image/jpeg")},
            timeout=TIMEOUT,
        )
        second_upload = qa_state["admin"].post(
            f"{API}/stock/{second_stock['id']}/photos",
            files={"file": ("second.png", b"TEST_SECOND_SNAPSHOT", "image/png")},
            timeout=TIMEOUT,
        )
        assert first_upload.status_code == second_upload.status_code == 200
        first_photo, second_photo = first_upload.json(), second_upload.json()

        created_booking = qa_state["admin"].post(
            f"{API}/bookings", json=_booking_payload(bng_id, first_stock["id"], "SNAPSHOT"), timeout=TIMEOUT
        )
        assert created_booking.status_code == 200, created_booking.text
        booking = created_booking.json()
        qa_state["booking_ids"].append(booking["id"])
        assert booking["stock_id"] == first_stock["id"]
        assert [p["id"] for p in booking["stock_photos"]] == [first_photo["id"]]
        assert booking["product_name"] == "TEST Snapshot Original"

        renamed = qa_state["admin"].put(
            f"{API}/stock/{first_stock['id']}", json={"name": "TEST Renamed Later"}, timeout=TIMEOUT
        )
        assert renamed.status_code == 200
        old_snapshot = qa_state["admin"].get(f"{API}/bookings/{booking['id']}", timeout=TIMEOUT).json()
        assert old_snapshot["product_name"] == "TEST Snapshot Original"
        assert [p["id"] for p in old_snapshot["stock_photos"]] == [first_photo["id"]]

        resnapshot = qa_state["admin"].put(
            f"{API}/bookings/{booking['id']}", json={"stock_id": second_stock["id"]}, timeout=TIMEOUT
        )
        assert resnapshot.status_code == 200, resnapshot.text
        assert resnapshot.json()["stock_id"] == second_stock["id"]
        assert [p["id"] for p in resnapshot.json()["stock_photos"]] == [second_photo["id"]]

        invalid = qa_state["admin"].post(
            f"{API}/bookings", json=_booking_payload(bng_id, "does-not-exist", "INVALID"), timeout=TIMEOUT
        )
        cross_branch = qa_state["admin"].post(
            f"{API}/bookings", json=_booking_payload(bng_id, cross_stock["id"], "CROSS"), timeout=TIMEOUT
        )
        assert invalid.status_code == 200 and cross_branch.status_code == 200
        qa_state["booking_ids"].extend([invalid.json()["id"], cross_branch.json()["id"]])
        assert invalid.json()["stock_id"] is None and invalid.json()["stock_photos"] == []
        assert cross_branch.json()["stock_id"] is None and cross_branch.json()["stock_photos"] == []

        delete_stock = qa_state["admin"].delete(f"{API}/stock/{second_stock['id']}", timeout=TIMEOUT)
        assert delete_stock.status_code == 200
        qa_state["stock_ids"].remove(second_stock["id"])
        persisted_booking = qa_state["admin"].get(f"{API}/bookings/{booking['id']}", timeout=TIMEOUT)
        assert persisted_booking.status_code == 200
        assert persisted_booking.json()["stock_id"] is None
        assert [p["id"] for p in persisted_booking.json()["stock_photos"]] == [second_photo["id"]]
        served_snapshot = requests.get(
            f"{API}/files/{second_photo['id']}", params={"auth": qa_state["staff_token"]}, timeout=TIMEOUT
        )
        assert served_snapshot.status_code == 200 and served_snapshot.content == b"TEST_SECOND_SNAPSHOT"

    def test_update_with_null_stock_id_unlinks_and_clears_snapshot(self, qa_state):
        bng_id = qa_state["branches"]["BNG"]["id"]
        stock_response = _create_stock(qa_state["admin"], bng_id, name="TEST Explicit Unlink")
        assert stock_response.status_code == 200
        stock = stock_response.json()
        qa_state["stock_ids"].append(stock["id"])
        upload = qa_state["admin"].post(
            f"{API}/stock/{stock['id']}/photos",
            files={"file": ("unlink.png", b"TEST_UNLINK", "image/png")},
            timeout=TIMEOUT,
        )
        assert upload.status_code == 200
        booking_response = qa_state["admin"].post(
            f"{API}/bookings", json=_booking_payload(bng_id, stock["id"], "UNLINK"), timeout=TIMEOUT
        )
        assert booking_response.status_code == 200
        booking = booking_response.json()
        qa_state["booking_ids"].append(booking["id"])
        assert booking["stock_id"] == stock["id"] and len(booking["stock_photos"]) == 1

        unlink = qa_state["admin"].put(
            f"{API}/bookings/{booking['id']}", json={"stock_id": None}, timeout=TIMEOUT
        )
        assert unlink.status_code == 200, unlink.text
        assert unlink.json()["stock_id"] is None
        assert unlink.json()["stock_photos"] == []


# Existing API regression checks requested for iteration 5.
class TestRegressionSanity:
    @pytest.mark.parametrize(
        ("path", "expected_type"),
        [
            ("/bookings", list),
            ("/branches", list),
            ("/users", list),
            ("/audit", list),
        ],
    )
    def test_list_endpoints(self, qa_state, path, expected_type):
        response = qa_state["admin"].get(f"{API}{path}", timeout=TIMEOUT)
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), expected_type)

    def test_auth_and_revenue(self, qa_state):
        me = qa_state["admin"].get(f"{API}/auth/me", timeout=TIMEOUT)
        revenue = qa_state["admin"].get(f"{API}/stats/revenue", timeout=TIMEOUT)
        assert me.status_code == 200 and me.json()["role"] == "super_admin"
        assert revenue.status_code == 200
        assert isinstance(revenue.json().get("series"), list)
        assert isinstance(revenue.json().get("branch_codes"), list)


# Requested authentication playbook checks against the public endpoint.
class TestAuthHardening:
    def test_admin_bcrypt_hash_format(self):
        backend_env = dotenv_values("/app/backend/.env")
        mongo = MongoClient(backend_env["MONGO_URL"], serverSelectionTimeoutMS=5000)
        try:
            admin_email, _ = _credentials_from_memory()
            user = mongo[backend_env["DB_NAME"]].users.find_one({"email": admin_email})
            assert user is not None
            assert user["password_hash"].startswith("$2b$")
        finally:
            mongo.close()

    def test_login_sets_httponly_cookie(self):
        email, password = _credentials_from_memory()
        response = _login(email, password)
        assert response.status_code == 200
        set_cookie = response.headers.get("set-cookie", "")
        assert set_cookie, "Login response did not set any cookie"
        cookie_names = re.findall(r"(?:^|,)\s*([^=;,\s]+)=", set_cookie)
        app_cookie_names = [
            name for name in cookie_names
            if name != "__cf_bm" and re.search(r"auth|token|session|access", name, re.IGNORECASE)
        ]
        assert app_cookie_names, f"Login set no application authentication cookie; cookies were {cookie_names}"
        assert "httponly" in set_cookie.lower()

    def test_cors_rejects_unconfigured_origin(self):
        response = requests.options(
            f"{API}/auth/login",
            headers={
                "Origin": "https://untrusted-origin.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
            timeout=TIMEOUT,
        )
        allow_origin = response.headers.get("access-control-allow-origin")
        assert allow_origin not in {"*", "https://untrusted-origin.example"}, (
            f"CORS accepted an unconfigured origin: {allow_origin}"
        )

    def test_brute_force_lockout_after_five_failures(self, qa_state):
        for _ in range(5):
            failed = _login(qa_state["staff_email"], "definitely-wrong-password")
            assert failed.status_code == 401
        sixth = _login(qa_state["staff_email"], "definitely-wrong-password")
        assert sixth.status_code in {423, 429}, f"Expected lockout after five failures, got {sixth.status_code}"
