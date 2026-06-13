from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
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

app = FastAPI(title="Jewellery Rental CRM")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# ---------- Auth helpers ----------
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


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------- Models ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class CustomerInfo(BaseModel):
    name: str
    phone: str
    address: Optional[str] = ""
    id_proof: Optional[str] = ""


class BookingCreate(BaseModel):
    bill_no: Optional[str] = None  # auto-generated if blank
    product_code: str
    product_name: Optional[str] = ""
    booking_date: str        # ISO date YYYY-MM-DD
    delivery_date: str
    return_date: str
    rental_amount: float = 0
    total_advance: float = 0
    advance_paid: float = 0
    customer_to_be_paid: float = 0
    return_to_be_paid_to_customer: float = 0
    customer: CustomerInfo
    status: str = "Booked"  # Booked | Delivered | Returned
    notes: Optional[str] = ""


class BookingUpdate(BaseModel):
    bill_no: Optional[str] = None
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


class Booking(BookingCreate):
    id: str
    created_at: str
    updated_at: str


# ---------- Auth routes ----------
@api_router.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"])
    return LoginResponse(
        access_token=token,
        user={"id": user["id"], "email": user["email"], "name": user.get("name", "Admin")},
    )


@api_router.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return current


# ---------- Bill No generator ----------
async def next_bill_no() -> str:
    counter = await db.counters.find_one_and_update(
        {"_id": "bill_no"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = counter["seq"] if counter else 1
    return f"BILL-{seq:04d}"


# ---------- Bookings routes ----------
@api_router.post("/bookings", response_model=Booking)
async def create_booking(data: BookingCreate, current=Depends(get_current_user)):
    bill_no = (data.bill_no or "").strip()
    if not bill_no:
        bill_no = await next_bill_no()
    else:
        exists = await db.bookings.find_one({"bill_no": bill_no})
        if exists:
            raise HTTPException(status_code=400, detail=f"Bill No '{bill_no}' already exists")
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = data.model_dump()
    doc["bill_no"] = bill_no
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso
    doc["updated_at"] = now_iso
    await db.bookings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/bookings", response_model=List[Booking])
async def list_bookings(
    search: Optional[str] = None,
    status: Optional[str] = None,
    current=Depends(get_current_user),
):
    q = {}
    if status and status != "all":
        q["status"] = status
    if search:
        s = search.strip()
        q["$or"] = [
            {"bill_no": {"$regex": s, "$options": "i"}},
            {"product_code": {"$regex": s, "$options": "i"}},
            {"product_name": {"$regex": s, "$options": "i"}},
            {"customer.name": {"$regex": s, "$options": "i"}},
            {"customer.phone": {"$regex": s, "$options": "i"}},
        ]
    items = await db.bookings.find(q, {"_id": 0}).sort("booking_date", -1).to_list(1000)
    return items


@api_router.get("/bookings/{booking_id}", response_model=Booking)
async def get_booking(booking_id: str, current=Depends(get_current_user)):
    item = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Booking not found")
    return item


@api_router.put("/bookings/{booking_id}", response_model=Booking)
async def update_booking(booking_id: str, data: BookingUpdate, current=Depends(get_current_user)):
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "bill_no" in update:
        dup = await db.bookings.find_one({"bill_no": update["bill_no"], "id": {"$ne": booking_id}})
        if dup:
            raise HTTPException(status_code=400, detail="Bill No already in use")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.bookings.find_one_and_update(
        {"id": booking_id}, {"$set": update}, return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Booking not found")
    result.pop("_id", None)
    return result


@api_router.delete("/bookings/{booking_id}")
async def delete_booking(booking_id: str, current=Depends(get_current_user)):
    res = await db.bookings.delete_one({"id": booking_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"ok": True}


# ---------- Stats ----------
@api_router.get("/stats/dashboard")
async def dashboard_stats(current=Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    week_ahead = (datetime.now(timezone.utc).date() + timedelta(days=7)).isoformat()

    all_bookings = await db.bookings.find({}, {"_id": 0}).to_list(5000)

    currently_rented = [b for b in all_bookings if b.get("status") in ("Booked", "Delivered")]
    upcoming_returns = [
        b for b in currently_rented if today <= b.get("return_date", "") <= week_ahead
    ]
    overdue = [
        b for b in currently_rented if b.get("return_date", "") < today
    ]

    total_rental = sum(float(b.get("rental_amount") or 0) for b in all_bookings)
    total_advance_collected = sum(float(b.get("advance_paid") or 0) for b in all_bookings)
    pending_from_customer = sum(
        max(float(b.get("customer_to_be_paid") or 0), 0) for b in all_bookings
    )
    pending_to_customer = sum(
        max(float(b.get("return_to_be_paid_to_customer") or 0), 0) for b in all_bookings
    )

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
    await db.bookings.create_index("id", unique=True)
    await db.bookings.create_index("bill_no", unique=True)
    await db.bookings.create_index("status")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@jewel.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logging.info("Admin user seeded: %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logging.info("Admin password updated for: %s", admin_email)


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------- App wiring ----------
@api_router.get("/")
async def root():
    return {"message": "Jewellery Rental CRM API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
