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

### Iteration 4 (Feb 2026) — P2 features
- ✅ **Per-branch monthly revenue chart** on Dashboard — recharts BarChart, gradient bars, 12-month window; stacks by branch when super_admin views "All branches", auto-collapses to single-series when filtered to one branch; branch-scoped for managers/staff.
- ✅ **Jewellery photo upload** — up to 5 photos per booking via Emergent object storage. Multipart POST /api/bookings/{id}/photos with content-type + size validation (JPG/PNG/WebP, ≤8 MB). Photos served via authenticated /api/files/{id}?auth=<token>. Thumbnail grid with hover-to-delete inside the edit dialog. Managers can delete; staff can only view.
- ✅ **Audit log** — every create/update/delete on branches, users, bookings, and photos is captured to `audit_log` collection with user, entity, summary, branch, timestamp. `/audit` page with search + action + entity + branch filters. Super admin sees everything; managers see own branch only; staff has no access (403).
- ✅ 22/22 backend tests pass; full frontend flow verified for super_admin + manager.

### Iteration 5 (Jul 2026) — Stock module
- ✅ **Stock inventory** — new `/stock` page (visible to all roles, branch-scoped). Managers/super admin can add/edit/delete stock items with unique code per branch, name, description, notes, and up to 5 photos each (Emergent object storage). Beautiful card grid with cover photo + code + branch badge.
- ✅ **Stock code autofill on bookings** — the New/Edit Booking dialog gained a "Load from stock" search: type any code or name → live dropdown with photo thumbnails → click to fill product code, product name, link stock_id, and copy the stock's active photos onto the booking as a snapshot. Unlink button clears the link.
- ✅ **Bill/Invoice photos** — printed invoice now shows the linked stock's photos in an "Item photos" strip below the item block, so bills carry visual proof of the jewellery.
- ✅ **Snapshot semantics** — `booking.stock_photos` is intentionally decoupled from live stock: if the stock item is later edited or deleted, existing bookings/invoices retain their original photos.
- ✅ **Photo delete hardening** — DELETE endpoints for both stock and booking photos now validate the photo belongs to the scoped owner (404 otherwise) and only mark files owned by that entity as deleted.
- ✅ **Explicit unlink** — PUT /api/bookings accepts `stock_id: null` to clear the link + snapshot while preserving PATCH semantics for other fields.
- ✅ 4/4 backend + 1/1 frontend retest scenarios pass 100%.

## Backlog
### Iteration 3 (Feb 2026) — P1 features ✅
- ✅ **Printable branch-aware invoice** at `/invoice/:id` — clean light card with branch name/address/phone, customer + item blocks, amount breakdown incl. rental balance, signature line. Uses browser native print → Save as PDF.
- ✅ **CSV export** on Bookings page — exports the currently filtered list with 18 columns; UTF-8 BOM, proper escaping.
- ✅ **Customer master list** at `/customers` (branch-scoped) — aggregates by phone, shows total bookings, total rental, advance paid, outstanding to collect/refund, last booking date, branch badges. Detail dialog shows full booking history with one-click invoice link.
- ✅ 13/13 new backend tests pass; full frontend flow verified for super_admin + manager.

### Next P1
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
