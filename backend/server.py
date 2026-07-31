from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import asyncio
import logging
import uuid
import re
import bcrypt
import jwt
import requests
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Header, Query
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


# ---------- Setup ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

# ---------- Object storage ----------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "banglzz-crm"
MAX_PHOTOS_PER_BOOKING = 5
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}
MIME_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": key}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logging.error("Storage init failed: %s", e)
        return None


def _put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise RuntimeError("Storage not initialized")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _get_object_sync(path: str) -> tuple:
    key = init_storage()
    if not key:
        raise RuntimeError("Storage not initialized")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    return await asyncio.to_thread(_put_object_sync, path, data, content_type)


async def get_object(path: str) -> tuple:
    return await asyncio.to_thread(_get_object_sync, path)


app = FastAPI(title="Banglzz & Kalyani Covering CRM")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

ROLE_SUPER = "super_admin"
ROLE_MANAGER = "manager"
ROLE_STAFF = "staff"
VALID_ROLES = {ROLE_SUPER, ROLE_MANAGER, ROLE_STAFF}


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u.get("role", ROLE_STAFF),
        "branch_id": u.get("branch_id"),
        "created_at": u.get("created_at"),
    }


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(user: dict, allowed: set):
    if user.get("role") not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


# ---------- Audit log ----------
async def log_action(
    current: dict,
    action: str,
    entity_type: str,
    entity_id: Optional[str],
    summary: str,
    branch_id: Optional[str] = None,
):
    try:
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "summary": summary,
            "user_id": current.get("id"),
            "user_email": current.get("email"),
            "user_name": current.get("name"),
            "user_role": current.get("role"),
            "branch_id": branch_id if branch_id is not None else current.get("branch_id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logging.warning("Audit log failed: %s", e)


# ---------- Models ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class BranchCreate(BaseModel):
    name: str
    code: str  # short code used for bill prefix (e.g., BNG)
    address: Optional[str] = ""
    phone: Optional[str] = ""


class BranchUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str  # manager | staff (super_admin can be created only via env seeding)
    branch_id: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    branch_id: Optional[str] = None


class CustomerInfo(BaseModel):
    name: str
    phone: str
    address: Optional[str] = ""
    id_proof: Optional[str] = ""


class BookingCreate(BaseModel):
    bill_no: Optional[str] = None
    branch_id: Optional[str] = None  # required; super_admin must supply
    stock_id: Optional[str] = None
    product_code: str
    product_name: Optional[str] = ""
    booking_date: str
    delivery_date: str
    return_date: str
    rental_amount: float = 0
    total_advance: float = 0
    advance_paid: float = 0
    customer_to_be_paid: float = 0
    return_to_be_paid_to_customer: float = 0
    customer: CustomerInfo
    status: str = "Booked"
    notes: Optional[str] = ""


class BookingUpdate(BaseModel):
    bill_no: Optional[str] = None
    stock_id: Optional[str] = None
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    booking_date: Optional[str] = None
    delivery_date: Optional[str] = None
    return_date: Optional[str] = None
    rental_amount: Optional[float] = None
    total_advance: Optional[float] = None
    advance_paid: Optional[float] = None
    customer_to_be_paid: Optional[float] = None
    return_to_be_paid_to_customer: Optional[float] = None
    customer: Optional[CustomerInfo] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class StockCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = ""
    notes: Optional[str] = ""
    branch_id: Optional[str] = None  # required for super_admin


class StockUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


# ---------- Auth routes ----------
@api_router.post("/auth/login")
async def login(req: LoginRequest):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"])
    me = public_user(user)
    if me.get("branch_id"):
        branch = await db.branches.find_one({"id": me["branch_id"]}, {"_id": 0})
        me["branch"] = branch
    return {"access_token": token, "token_type": "bearer", "user": me}


@api_router.get("/auth/me")
async def me(current=Depends(get_current_user)):
    out = public_user(current)
    if out.get("branch_id"):
        branch = await db.branches.find_one({"id": out["branch_id"]}, {"_id": 0})
        out["branch"] = branch
    return out


# ---------- Branches ----------
@api_router.get("/branches")
async def list_branches(current=Depends(get_current_user)):
    items = await db.branches.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    # Non-super users only see their own branch
    if current.get("role") != ROLE_SUPER:
        items = [b for b in items if b["id"] == current.get("branch_id")]
    return items


@api_router.post("/branches")
async def create_branch(data: BranchCreate, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER})
    code = data.code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{2,8}", code):
        raise HTTPException(status_code=400, detail="Code must be 2-8 uppercase letters/numbers")
    if await db.branches.find_one({"code": code}):
        raise HTTPException(status_code=400, detail="Branch code already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "code": code,
        "address": data.address or "",
        "phone": data.phone or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.branches.insert_one(doc)
    doc.pop("_id", None)
    await log_action(current, "create", "branch", doc["id"],
                     f"Created branch {doc['code']} ({doc['name']})", branch_id=doc["id"])
    return doc


@api_router.put("/branches/{branch_id}")
async def update_branch(branch_id: str, data: BranchUpdate, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER})
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "code" in update:
        update["code"] = update["code"].strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{2,8}", update["code"]):
            raise HTTPException(status_code=400, detail="Invalid code")
        dup = await db.branches.find_one({"code": update["code"], "id": {"$ne": branch_id}})
        if dup:
            raise HTTPException(status_code=400, detail="Branch code already exists")
    res = await db.branches.find_one_and_update(
        {"id": branch_id}, {"$set": update}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="Branch not found")
    res.pop("_id", None)
    return res


@api_router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER})
    has_users = await db.users.find_one({"branch_id": branch_id})
    if has_users:
        raise HTTPException(status_code=400, detail="Cannot delete: branch has users assigned")
    has_bookings = await db.bookings.find_one({"branch_id": branch_id})
    if has_bookings:
        raise HTTPException(status_code=400, detail="Cannot delete: branch has bookings")
    res = await db.branches.delete_one({"id": branch_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Branch not found")
    await log_action(current, "delete", "branch", branch_id, "Deleted branch", branch_id=branch_id)
    return {"ok": True}


# ---------- Users ----------
@api_router.get("/users")
async def list_users(current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q = {}
    if current["role"] == ROLE_MANAGER:
        q["branch_id"] = current.get("branch_id")
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return users


@api_router.post("/users")
async def create_user(data: UserCreate, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    role = data.role.lower()
    if role not in {ROLE_MANAGER, ROLE_STAFF}:
        raise HTTPException(status_code=400, detail="Role must be 'manager' or 'staff'")
    if current["role"] == ROLE_MANAGER:
        # managers can only create staff in their own branch
        if role != ROLE_STAFF:
            raise HTTPException(status_code=403, detail="Managers can only create staff users")
        branch_id = current.get("branch_id")
    else:
        branch_id = data.branch_id
    if not branch_id:
        raise HTTPException(status_code=400, detail="branch_id is required")
    branch = await db.branches.find_one({"id": branch_id})
    if not branch:
        raise HTTPException(status_code=400, detail="Branch not found")
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name.strip(),
        "role": role,
        "branch_id": branch_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await log_action(current, "create", "user", doc["id"],
                     f"Created {role} {doc['email']}", branch_id=branch_id)
    return public_user(doc)


@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == ROLE_SUPER:
        raise HTTPException(status_code=403, detail="Cannot modify super admin")
    if current["role"] == ROLE_MANAGER and target.get("branch_id") != current.get("branch_id"):
        raise HTTPException(status_code=403, detail="Cannot modify users outside your branch")
    update = {}
    if data.name is not None:
        update["name"] = data.name.strip()
    if data.password:
        update["password_hash"] = hash_password(data.password)
    if data.role is not None:
        if current["role"] != ROLE_SUPER:
            raise HTTPException(status_code=403, detail="Only super admin can change roles")
        if data.role not in {ROLE_MANAGER, ROLE_STAFF}:
            raise HTTPException(status_code=400, detail="Invalid role")
        update["role"] = data.role
    if data.branch_id is not None:
        if current["role"] != ROLE_SUPER:
            raise HTTPException(status_code=403, detail="Only super admin can change branch")
        if not await db.branches.find_one({"id": data.branch_id}):
            raise HTTPException(status_code=400, detail="Branch not found")
        update["branch_id"] = data.branch_id
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.users.find_one_and_update({"id": user_id}, {"$set": update}, return_document=True)
    await log_action(current, "update", "user", user_id,
                     f"Updated user {res.get('email')}", branch_id=res.get("branch_id"))
    return public_user(res)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == ROLE_SUPER:
        raise HTTPException(status_code=403, detail="Cannot delete super admin")
    if current["role"] == ROLE_MANAGER and target.get("branch_id") != current.get("branch_id"):
        raise HTTPException(status_code=403, detail="Cannot delete users outside your branch")
    if target["id"] == current["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"id": user_id})
    await log_action(current, "delete", "user", user_id,
                     f"Deleted user {target.get('email')}", branch_id=target.get("branch_id"))
    return {"ok": True}


# ---------- Bill number ----------
async def next_bill_no(branch_code: str) -> str:
    counter = await db.counters.find_one_and_update(
        {"_id": f"bill_no_{branch_code}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = counter["seq"] if counter else 1
    return f"{branch_code}-{seq:04d}"


# ---------- Bookings ----------
def booking_scope(current: dict) -> dict:
    if current["role"] == ROLE_SUPER:
        return {}
    return {"branch_id": current.get("branch_id")}


@api_router.post("/bookings")
async def create_booking(data: BookingCreate, current=Depends(get_current_user)):
    if current["role"] == ROLE_SUPER:
        if not data.branch_id:
            raise HTTPException(status_code=400, detail="branch_id is required")
        branch_id = data.branch_id
    else:
        branch_id = current.get("branch_id")
        if not branch_id:
            raise HTTPException(status_code=400, detail="No branch assigned to your account")
    branch = await db.branches.find_one({"id": branch_id})
    if not branch:
        raise HTTPException(status_code=400, detail="Branch not found")

    bill_no = (data.bill_no or "").strip()
    if not bill_no:
        bill_no = await next_bill_no(branch["code"])
    else:
        if await db.bookings.find_one({"bill_no": bill_no}):
            raise HTTPException(status_code=400, detail=f"Bill No '{bill_no}' already exists")

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = data.model_dump()
    doc["bill_no"] = bill_no
    doc["branch_id"] = branch_id
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso
    doc["updated_at"] = now_iso
    doc["created_by"] = current["id"]
    # Snapshot stock photos if a stock item is linked
    if doc.get("stock_id"):
        stock = await db.stock_items.find_one({"id": doc["stock_id"], "branch_id": branch_id}, {"_id": 0})
        if stock:
            doc["stock_photos"] = [p for p in (stock.get("photos") or []) if not p.get("is_deleted")]
            if not doc.get("product_name"):
                doc["product_name"] = stock.get("name") or ""
        else:
            doc["stock_id"] = None
            doc["stock_photos"] = []
    else:
        doc["stock_photos"] = []
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    await log_action(current, "create", "booking", doc["id"],
                     f"Created booking {bill_no} for {data.customer.name}", branch_id=branch_id)
    return doc


@api_router.get("/bookings")
async def list_bookings(
    search: Optional[str] = None,
    status: Optional[str] = None,
    branch_id: Optional[str] = None,
    current=Depends(get_current_user),
):
    q = booking_scope(current)
    if status and status != "all":
        q["status"] = status
    if current["role"] == ROLE_SUPER and branch_id and branch_id != "all":
        q["branch_id"] = branch_id
    if search:
        s = search.strip()
        q["$or"] = [
            {"bill_no": {"$regex": s, "$options": "i"}},
            {"product_code": {"$regex": s, "$options": "i"}},
            {"product_name": {"$regex": s, "$options": "i"}},
            {"customer.name": {"$regex": s, "$options": "i"}},
            {"customer.phone": {"$regex": s, "$options": "i"}},
        ]
    items = await db.bookings.find(q, {"_id": 0}).sort("booking_date", -1).to_list(2000)
    return items


@api_router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, current=Depends(get_current_user)):
    q = {"id": booking_id, **booking_scope(current)}
    item = await db.bookings.find_one(q, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Booking not found")
    return item


@api_router.put("/bookings/{booking_id}")
async def update_booking(booking_id: str, data: BookingUpdate, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q = {"id": booking_id, **booking_scope(current)}
    existing = await db.bookings.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Booking not found")
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "bill_no" in update:
        dup = await db.bookings.find_one({"bill_no": update["bill_no"], "id": {"$ne": booking_id}})
        if dup:
            raise HTTPException(status_code=400, detail="Bill No already in use")
    # Re-snapshot stock photos if stock_id was set/changed
    if "stock_id" in update and update["stock_id"]:
        stock = await db.stock_items.find_one(
            {"id": update["stock_id"], "branch_id": existing.get("branch_id")}, {"_id": 0}
        )
        if stock:
            update["stock_photos"] = [p for p in (stock.get("photos") or []) if not p.get("is_deleted")]
            if not update.get("product_name") and not existing.get("product_name"):
                update["product_name"] = stock.get("name") or ""
        else:
            update["stock_id"] = None
            update["stock_photos"] = []
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.bookings.find_one_and_update({"id": booking_id}, {"$set": update}, return_document=True)
    res.pop("_id", None)
    changed = [k for k in update.keys() if k != "updated_at"]
    await log_action(current, "update", "booking", booking_id,
                     f"Updated booking {res.get('bill_no')} ({', '.join(changed[:4])})",
                     branch_id=res.get("branch_id"))
    return res


@api_router.delete("/bookings/{booking_id}")
async def delete_booking(booking_id: str, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q = {"id": booking_id, **booking_scope(current)}
    existing = await db.bookings.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Booking not found")
    await db.bookings.delete_one(q)
    await log_action(current, "delete", "booking", booking_id,
                     f"Deleted booking {existing.get('bill_no')}",
                     branch_id=existing.get("branch_id"))
    return {"ok": True}


# ---------- Customers (aggregated from bookings) ----------
@api_router.get("/customers")
async def list_customers(
    search: Optional[str] = None,
    branch_id: Optional[str] = None,
    current=Depends(get_current_user),
):
    q = booking_scope(current)
    if current["role"] == ROLE_SUPER and branch_id and branch_id != "all":
        q["branch_id"] = branch_id
    if search:
        s = search.strip()
        q["$or"] = [
            {"customer.name": {"$regex": s, "$options": "i"}},
            {"customer.phone": {"$regex": s, "$options": "i"}},
        ]
    items = await db.bookings.find(q, {"_id": 0}).to_list(10000)
    by_phone: dict = {}
    for b in items:
        c = b.get("customer") or {}
        phone = (c.get("phone") or "").strip()
        if not phone:
            continue
        entry = by_phone.get(phone)
        if not entry:
            entry = {
                "phone": phone,
                "name": c.get("name", ""),
                "address": c.get("address", ""),
                "id_proof": c.get("id_proof", ""),
                "total_bookings": 0,
                "total_rental": 0.0,
                "total_advance_paid": 0.0,
                "outstanding_to_collect": 0.0,
                "outstanding_to_refund": 0.0,
                "last_booking_date": "",
                "branch_ids": set(),
                "bookings": [],
            }
            by_phone[phone] = entry
        entry["total_bookings"] += 1
        entry["total_rental"] += float(b.get("rental_amount") or 0)
        entry["total_advance_paid"] += float(b.get("advance_paid") or 0)
        if b.get("status") != "Returned":
            entry["outstanding_to_collect"] += max(float(b.get("customer_to_be_paid") or 0), 0)
            entry["outstanding_to_refund"] += max(float(b.get("return_to_be_paid_to_customer") or 0), 0)
        entry["last_booking_date"] = max(entry["last_booking_date"], b.get("booking_date", ""))
        if b.get("branch_id"):
            entry["branch_ids"].add(b["branch_id"])
        entry["bookings"].append({
            "id": b["id"],
            "bill_no": b.get("bill_no"),
            "branch_id": b.get("branch_id"),
            "product_code": b.get("product_code"),
            "product_name": b.get("product_name"),
            "booking_date": b.get("booking_date"),
            "delivery_date": b.get("delivery_date"),
            "return_date": b.get("return_date"),
            "rental_amount": b.get("rental_amount"),
            "status": b.get("status"),
        })
        if c.get("name") and not entry["name"]:
            entry["name"] = c["name"]
        if c.get("address") and not entry["address"]:
            entry["address"] = c["address"]
        if c.get("id_proof") and not entry["id_proof"]:
            entry["id_proof"] = c["id_proof"]
    out = []
    for e in by_phone.values():
        e["branch_ids"] = sorted(list(e["branch_ids"]))
        e["bookings"].sort(key=lambda x: x.get("booking_date") or "", reverse=True)
        e["total_rental"] = round(e["total_rental"], 2)
        e["total_advance_paid"] = round(e["total_advance_paid"], 2)
        e["outstanding_to_collect"] = round(e["outstanding_to_collect"], 2)
        e["outstanding_to_refund"] = round(e["outstanding_to_refund"], 2)
        out.append(e)
    out.sort(key=lambda x: x.get("last_booking_date") or "", reverse=True)
    return out


# ---------- Stock (inventory) ----------
def stock_scope(current: dict) -> dict:
    if current["role"] == ROLE_SUPER:
        return {}
    return {"branch_id": current.get("branch_id")}


@api_router.get("/stock")
async def list_stock(
    search: Optional[str] = None,
    branch_id: Optional[str] = None,
    current=Depends(get_current_user),
):
    q = stock_scope(current)
    if current["role"] == ROLE_SUPER and branch_id and branch_id != "all":
        q["branch_id"] = branch_id
    if search:
        s = search.strip()
        q["$or"] = [
            {"code": {"$regex": s, "$options": "i"}},
            {"name": {"$regex": s, "$options": "i"}},
            {"description": {"$regex": s, "$options": "i"}},
        ]
    items = await db.stock_items.find(q, {"_id": 0}).sort("code", 1).to_list(2000)
    return items


@api_router.get("/stock/{stock_id}")
async def get_stock(stock_id: str, current=Depends(get_current_user)):
    q = {"id": stock_id, **stock_scope(current)}
    item = await db.stock_items.find_one(q, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Stock item not found")
    return item


@api_router.post("/stock")
async def create_stock(data: StockCreate, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    if current["role"] == ROLE_SUPER:
        if not data.branch_id:
            raise HTTPException(status_code=400, detail="branch_id is required")
        branch_id = data.branch_id
    else:
        branch_id = current.get("branch_id")
    if not await db.branches.find_one({"id": branch_id}):
        raise HTTPException(status_code=400, detail="Branch not found")
    code = data.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")
    if await db.stock_items.find_one({"code": code, "branch_id": branch_id}):
        raise HTTPException(status_code=400, detail=f"Stock code '{code}' already exists in this branch")
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "branch_id": branch_id,
        "code": code,
        "name": data.name.strip(),
        "description": data.description or "",
        "notes": data.notes or "",
        "photos": [],
        "created_at": now_iso,
        "updated_at": now_iso,
        "created_by": current["id"],
    }
    await db.stock_items.insert_one(doc)
    doc.pop("_id", None)
    await log_action(current, "create", "stock", doc["id"],
                     f"Created stock item {code} ({doc['name']})", branch_id=branch_id)
    return doc


@api_router.put("/stock/{stock_id}")
async def update_stock(stock_id: str, data: StockUpdate, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q = {"id": stock_id, **stock_scope(current)}
    existing = await db.stock_items.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Stock item not found")
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "code" in update:
        update["code"] = update["code"].strip()
        if not update["code"]:
            raise HTTPException(status_code=400, detail="Code cannot be empty")
        dup = await db.stock_items.find_one({
            "code": update["code"],
            "branch_id": existing["branch_id"],
            "id": {"$ne": stock_id},
        })
        if dup:
            raise HTTPException(status_code=400, detail="Stock code already exists in this branch")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.stock_items.find_one_and_update({"id": stock_id}, {"$set": update}, return_document=True)
    res.pop("_id", None)
    await log_action(current, "update", "stock", stock_id,
                     f"Updated stock item {res.get('code')}", branch_id=res.get("branch_id"))
    return res


@api_router.delete("/stock/{stock_id}")
async def delete_stock(stock_id: str, current=Depends(get_current_user)):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q = {"id": stock_id, **stock_scope(current)}
    existing = await db.stock_items.find_one(q)
    if not existing:
        raise HTTPException(status_code=404, detail="Stock item not found")
    await db.stock_items.delete_one({"id": stock_id})
    # Unlink from any bookings (keep the photo snapshot intact)
    await db.bookings.update_many(
        {"stock_id": stock_id}, {"$set": {"stock_id": None}}
    )
    await log_action(current, "delete", "stock", stock_id,
                     f"Deleted stock item {existing.get('code')}",
                     branch_id=existing.get("branch_id"))
    return {"ok": True}


@api_router.post("/stock/{stock_id}/photos")
async def upload_stock_photo(
    stock_id: str,
    file: UploadFile = File(...),
    current=Depends(get_current_user),
):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q = {"id": stock_id, **stock_scope(current)}
    stock = await db.stock_items.find_one(q)
    if not stock:
        raise HTTPException(status_code=404, detail="Stock item not found")
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images are allowed")
    photos = stock.get("photos") or []
    if len(photos) >= MAX_PHOTOS_PER_BOOKING:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_PHOTOS_PER_BOOKING} photos per stock item")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 8 MB)")
    ext = MIME_EXT.get(content_type, "bin")
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/stock/{stock_id}/{file_id}.{ext}"
    try:
        result = await put_object(storage_path, data, content_type)
    except Exception as e:
        logging.error("Stock photo upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Photo upload failed")
    now_iso = datetime.now(timezone.utc).isoformat()
    photo_meta = {
        "id": file_id,
        "storage_path": result.get("path", storage_path),
        "content_type": content_type,
        "original_filename": file.filename or f"{file_id}.{ext}",
        "size": result.get("size", len(data)),
        "created_at": now_iso,
        "is_deleted": False,
    }
    await db.files.insert_one({**photo_meta, "stock_id": stock_id})
    await db.stock_items.update_one(
        {"id": stock_id},
        {"$push": {"photos": photo_meta}, "$set": {"updated_at": now_iso}},
    )
    await log_action(current, "create", "photo", file_id,
                     f"Uploaded photo to stock {stock.get('code')}",
                     branch_id=stock.get("branch_id"))
    return photo_meta


@api_router.delete("/stock/{stock_id}/photos/{photo_id}")
async def delete_stock_photo(
    stock_id: str, photo_id: str, current=Depends(get_current_user),
):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q = {"id": stock_id, **stock_scope(current)}
    stock = await db.stock_items.find_one(q)
    if not stock:
        raise HTTPException(status_code=404, detail="Stock item not found")
    await db.stock_items.update_one(
        {"id": stock_id},
        {"$pull": {"photos": {"id": photo_id}},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await db.files.update_one({"id": photo_id}, {"$set": {"is_deleted": True}})
    await log_action(current, "delete", "photo", photo_id,
                     f"Removed photo from stock {stock.get('code')}",
                     branch_id=stock.get("branch_id"))
    return {"ok": True}


# ---------- Photo uploads ----------
@api_router.post("/bookings/{booking_id}/photos")
async def upload_booking_photo(
    booking_id: str,
    file: UploadFile = File(...),
    current=Depends(get_current_user),
):
    q = {"id": booking_id, **booking_scope(current)}
    booking = await db.bookings.find_one(q)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images are allowed")
    photos = booking.get("photos") or []
    if len(photos) >= MAX_PHOTOS_PER_BOOKING:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_PHOTOS_PER_BOOKING} photos per booking")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 8 MB)")
    ext = MIME_EXT.get(content_type, "bin")
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/bookings/{booking_id}/{file_id}.{ext}"
    try:
        result = await put_object(storage_path, data, content_type)
    except Exception as e:
        logging.error("Photo upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Photo upload failed")
    now_iso = datetime.now(timezone.utc).isoformat()
    photo_meta = {
        "id": file_id,
        "storage_path": result.get("path", storage_path),
        "content_type": content_type,
        "original_filename": file.filename or f"{file_id}.{ext}",
        "size": result.get("size", len(data)),
        "created_at": now_iso,
        "is_deleted": False,
    }
    await db.files.insert_one({**photo_meta, "booking_id": booking_id})
    await db.bookings.update_one(
        {"id": booking_id},
        {"$push": {"photos": photo_meta}, "$set": {"updated_at": now_iso}},
    )
    await log_action(current, "create", "photo", file_id,
                     f"Uploaded photo to {booking.get('bill_no')}",
                     branch_id=booking.get("branch_id"))
    return photo_meta


@api_router.delete("/bookings/{booking_id}/photos/{photo_id}")
async def delete_booking_photo(
    booking_id: str, photo_id: str, current=Depends(get_current_user),
):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q = {"id": booking_id, **booking_scope(current)}
    booking = await db.bookings.find_one(q)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    await db.bookings.update_one(
        {"id": booking_id},
        {"$pull": {"photos": {"id": photo_id}},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await db.files.update_one({"id": photo_id}, {"$set": {"is_deleted": True}})
    await log_action(current, "delete", "photo", photo_id,
                     f"Removed photo from {booking.get('bill_no')}",
                     branch_id=booking.get("branch_id"))
    return {"ok": True}


@api_router.get("/files/{file_id}")
async def serve_file(
    file_id: str,
    auth: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    # img/<a> tags can't send Authorization header — accept ?auth=token too
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    record = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    # branch scope check
    if record.get("booking_id"):
        q = {"id": record["booking_id"]}
        if user.get("role") != ROLE_SUPER:
            q["branch_id"] = user.get("branch_id")
        booking = await db.bookings.find_one(q)
        if not booking:
            # allow if the booking's stock_photos snapshot references this file
            snap_q = {"stock_photos.id": file_id}
            if user.get("role") != ROLE_SUPER:
                snap_q["branch_id"] = user.get("branch_id")
            snap = await db.bookings.find_one(snap_q)
            if not snap:
                raise HTTPException(status_code=403, detail="Forbidden")
    elif record.get("stock_id"):
        q = {"id": record["stock_id"]}
        if user.get("role") != ROLE_SUPER:
            q["branch_id"] = user.get("branch_id")
        stock = await db.stock_items.find_one(q)
        if not stock:
            # allow if any booking in scope holds this file as a stock_photos snapshot
            snap_q = {"stock_photos.id": file_id}
            if user.get("role") != ROLE_SUPER:
                snap_q["branch_id"] = user.get("branch_id")
            snap = await db.bookings.find_one(snap_q)
            if not snap:
                raise HTTPException(status_code=403, detail="Forbidden")
    try:
        data, ctype = await get_object(record["storage_path"])
    except Exception as e:
        logging.error("File read failed: %s", e)
        raise HTTPException(status_code=500, detail="File read failed")
    return Response(content=data, media_type=record.get("content_type") or ctype)


# ---------- Audit log ----------
@api_router.get("/audit")
async def list_audit(
    search: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    branch_id: Optional[str] = None,
    limit: int = 200,
    current=Depends(get_current_user),
):
    require_role(current, {ROLE_SUPER, ROLE_MANAGER})
    q: dict = {}
    if current["role"] == ROLE_MANAGER:
        q["branch_id"] = current.get("branch_id")
    elif branch_id and branch_id != "all":
        q["branch_id"] = branch_id
    if action and action != "all":
        q["action"] = action
    if entity_type and entity_type != "all":
        q["entity_type"] = entity_type
    if search:
        s = search.strip()
        q["$or"] = [
            {"summary": {"$regex": s, "$options": "i"}},
            {"user_email": {"$regex": s, "$options": "i"}},
            {"user_name": {"$regex": s, "$options": "i"}},
        ]
    items = await db.audit_log.find(q, {"_id": 0}).sort("created_at", -1).to_list(max(1, min(limit, 500)))
    return items


# ---------- Revenue stats ----------
@api_router.get("/stats/revenue")
async def revenue_stats(
    months: int = 12,
    branch_id: Optional[str] = None,
    current=Depends(get_current_user),
):
    months = max(1, min(months, 24))
    today = datetime.now(timezone.utc).date()
    # Build last N months keys e.g. "2026-02"
    first_of_month = today.replace(day=1)
    cursor = first_of_month
    keys: list = []
    for _ in range(months):
        keys.append(cursor.strftime("%Y-%m"))
        # step back one month
        prev_year = cursor.year if cursor.month > 1 else cursor.year - 1
        prev_month = cursor.month - 1 if cursor.month > 1 else 12
        cursor = cursor.replace(year=prev_year, month=prev_month, day=1)
    keys.reverse()

    q = booking_scope(current)
    if current["role"] == ROLE_SUPER and branch_id and branch_id != "all":
        q["branch_id"] = branch_id

    bookings = await db.bookings.find(q, {"_id": 0}).to_list(20000)
    branches = await db.branches.find({}, {"_id": 0}).to_list(500)
    branch_map = {b["id"]: b for b in branches}

    # series = [{month, total, advance_paid, BNG: 1000, KLN: 500, ...}]
    series: list = []
    visible_branch_codes: set = set()
    for key in keys:
        row = {"month": key, "total": 0.0, "advance_paid": 0.0}
        for b in branches:
            row[b["code"]] = 0.0
        series.append(row)
    by_key = {row["month"]: row for row in series}

    for b in bookings:
        bd = (b.get("booking_date") or "")[:7]
        row = by_key.get(bd)
        if not row:
            continue
        amt = float(b.get("rental_amount") or 0)
        adv = float(b.get("advance_paid") or 0)
        row["total"] += amt
        row["advance_paid"] += adv
        br = branch_map.get(b.get("branch_id"))
        if br:
            row[br["code"]] += amt
            visible_branch_codes.add(br["code"])

    for row in series:
        for k, v in list(row.items()):
            if k != "month":
                row[k] = round(v, 2)

    return {
        "series": series,
        "branch_codes": sorted(list(visible_branch_codes)),
    }


# ---------- Stats ----------
@api_router.get("/stats/dashboard")
async def dashboard_stats(branch_id: Optional[str] = None, current=Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    week_ahead = (datetime.now(timezone.utc).date() + timedelta(days=7)).isoformat()

    q = booking_scope(current)
    if current["role"] == ROLE_SUPER and branch_id and branch_id != "all":
        q["branch_id"] = branch_id

    all_bookings = await db.bookings.find(q, {"_id": 0}).to_list(10000)

    currently_rented = [b for b in all_bookings if b.get("status") in ("Booked", "Delivered")]
    upcoming_returns = [b for b in currently_rented if today <= b.get("return_date", "") <= week_ahead]
    overdue = [b for b in currently_rented if b.get("return_date", "") < today]

    total_rental = sum(float(b.get("rental_amount") or 0) for b in all_bookings)
    total_advance_collected = sum(float(b.get("advance_paid") or 0) for b in all_bookings)
    pending_from_customer = sum(max(float(b.get("customer_to_be_paid") or 0), 0) for b in all_bookings)
    pending_to_customer = sum(max(float(b.get("return_to_be_paid_to_customer") or 0), 0) for b in all_bookings)

    return {
        "total_bookings": len(all_bookings),
        "currently_rented": len(currently_rented),
        "upcoming_returns": len(upcoming_returns),
        "overdue": len(overdue),
        "total_rental": round(total_rental, 2),
        "total_advance_collected": round(total_advance_collected, 2),
        "pending_from_customer": round(pending_from_customer, 2),
        "pending_to_customer": round(pending_to_customer, 2),
        "overdue_bookings": overdue[:10],
        "upcoming_bookings": sorted(upcoming_returns, key=lambda x: x.get("return_date", ""))[:10],
    }


# ---------- Startup ----------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.branches.create_index("id", unique=True)
    await db.branches.create_index("code", unique=True)
    await db.bookings.create_index("id", unique=True)
    await db.bookings.create_index("bill_no", unique=True)
    await db.bookings.create_index("branch_id")
    await db.bookings.create_index("status")
    await db.audit_log.create_index("created_at")
    await db.audit_log.create_index("entity_id")
    await db.audit_log.create_index("branch_id")
    await db.files.create_index("id", unique=True)
    await db.files.create_index("booking_id")
    await db.files.create_index("stock_id")
    await db.stock_items.create_index("id", unique=True)
    await db.stock_items.create_index("branch_id")
    await db.stock_items.create_index([("branch_id", 1), ("code", 1)], unique=True)

    # Init object storage (best-effort)
    try:
        await asyncio.to_thread(init_storage)
    except Exception as e:
        logging.warning("Storage init failed: %s", e)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@jewel.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Super Admin",
            "role": ROLE_SUPER,
            "branch_id": None,
            "password_hash": hash_password(admin_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logging.info("Super admin seeded: %s", admin_email)
    else:
        upd = {}
        if existing.get("role") != ROLE_SUPER:
            upd["role"] = ROLE_SUPER
        if "branch_id" not in existing:
            upd["branch_id"] = None
        if "name" not in existing or not existing.get("name"):
            upd["name"] = "Super Admin"
        if not verify_password(admin_password, existing["password_hash"]):
            upd["password_hash"] = hash_password(admin_password)
        if upd:
            await db.users.update_one({"email": admin_email}, {"$set": upd})


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------- App wiring ----------
@api_router.get("/")
async def root():
    return {"message": "Banglzz & Kalyani Covering CRM API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
