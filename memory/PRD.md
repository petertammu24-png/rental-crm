# PRD — Banglzz & Kalyani Covering CRM

## Original Problem Statement
> I own a rental jewellery shop. I need a CRM to track which jewellery sets are running, with fields: Bill No, Product Code, Booking Date, Rental Amount, Total Advance Amount, Advance Paid, Delivery Date, Customer To Be Paid, Return Date, Return To Be Paid To Customer.
>
> [Iteration 2] Like this UI [neumorphic dark purple]. Change name to **Banglzz & Kalyani Covering**. Add Branches. Login must be branch-wise and separate for individual users.

## User Choices
**Iteration 1**: single admin login • auto Bill No (with manual override) • customer name/phone/address/ID proof • all dashboard widgets • INR.
**Iteration 2**:
- Both Super Admin AND branch Managers can create users (super admin manages branches)
- Super Admin sees ALL branches; branch users see only their branch
- Roles: Manager (full CRUD in branch) + Staff (view + create only)
- Per-branch bill numbering with branch code prefix (e.g., BNG-0001, KLN-0001)

## Architecture
- Backend: FastAPI + Motor (Mongo) + bcrypt + PyJWT
- Frontend: React 19 + react-router 7, Tailwind, shadcn/ui (only Dialog + AlertDialog), sonner
- Theme: custom neumorphic dark purple (#251638 base, #DA4FF1 accent), Sora display font, Outfit body
- Collections: `users`, `branches`, `bookings`, `counters` (per-branch bill counter)
- RBAC enforced both at backend (`require_role`) and frontend (`RoleRoute` + nav filter)

## Personas
- **Super Admin** — manages all branches and users across the business
- **Branch Manager** — runs one branch end-to-end (CRUD on bookings + can hire staff)
- **Staff** — front-desk: creates bookings, views ledger

## Implemented
### Iteration 1 (Feb 2026)
- Admin login + JWT auth, bookings CRUD, dashboard stats, search/filter, INR formatting, status badges, overdue computation

### Iteration 2 (Feb 2026)
- ✅ Rebrand to "Banglzz & Kalyani Covering" + neumorphic dark purple UI
- ✅ Branches: full CRUD (super admin), unique code, used as bill-no prefix
- ✅ Users: full CRUD (super admin + managers scoped to own branch)
- ✅ Roles: super_admin / manager / staff with backend `require_role` + frontend `RoleRoute`
- ✅ Per-branch bill counters (BNG-0001, KLN-0001 sequence independently)
- ✅ Branch filter on Dashboard + Bookings (super admin only)
- ✅ Branch column with code badge on Bookings table
- ✅ Hidden edit/delete buttons for Staff role
- ✅ 21/21 RBAC backend tests pass; frontend route-gating verified via Playwright

## Backlog
### P1
- Per-booking detail page with payment-history timeline
- CSV / PDF export of bookings + invoice printout (branch-aware header)
- Customer master list (de-duped customer profile across bookings)
- "Cannot assign cross-branch" explicit 400 (currently silent override)

### P2
- WhatsApp / SMS reminders for upcoming returns and overdue
- Photo upload per jewellery set
- Revenue charts (per-branch monthly trend)
- Inventory module — in-shop vs out
- Audit log of who-did-what across branches
