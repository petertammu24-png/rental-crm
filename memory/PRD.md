# PRD — Jewellery Rental CRM ("Maharani Jewels")

## Original Problem Statement
> I own a rental jewellery shop. I need a CRM to track which jewellery sets are running, with fields: Bill No, Product Code, Booking Date, Rental Amount, Total Advance Amount, Advance Paid, Delivery Date, Customer To Be Paid, Return Date, Return To Be Paid To Customer.

## User Choices (Iteration 1)
- Auth: simple admin login (single admin)
- Bill No: auto-generated, with optional manual override
- Customer fields: Name, Phone, Address, ID Proof
- Dashboard widgets: currently rented, upcoming returns, overdue alerts, pending payments to collect/refund, revenue summary
- Currency: INR (₹)

## Architecture
- Backend: FastAPI + Motor (Mongo), bcrypt + PyJWT auth, single `/api` router
- Frontend: React 19 + react-router 7, Tailwind + shadcn/ui, sonner toasts
- Auth: JWT bearer token in localStorage (single-admin internal tool)
- DB collections: `users`, `bookings`, `counters` (for bill-no sequence)

## Personas
- **Shop owner / Admin** — single user managing all rentals, customers, payments.

## Core Requirements (static)
- Track every rental with the 10 fields listed above plus product name, notes, customer info, status
- Auto Bill No generation (BILL-0001…), manual override allowed but must be unique
- Search by bill / product / customer name / phone
- Filter by status: Booked / Delivered / Returned (Overdue computed from return_date)
- Edit and delete with confirmation
- Dashboard with live KPIs and overdue/upcoming lists

## Implemented (Feb 2026)
- ✅ Admin login + JWT auth (admin@jewel.com / admin123)
- ✅ Bookings CRUD (`POST/GET/PUT/DELETE /api/bookings`) with auto bill-no
- ✅ Search + status filter
- ✅ Dashboard stats endpoint `/api/stats/dashboard`
- ✅ Light "Organic & Earthy" theme (emerald + bone + gold), Fraunces display font
- ✅ Sticky-bill-no horizontal-scroll data table
- ✅ Date inputs (native), INR formatting, status badges including computed Overdue
- ✅ Full E2E tested (14/14 backend, frontend happy path)

## Backlog
### P0
- (none — MVP complete)

### P1
- Per-booking detail page with payment history timeline
- Status transitions auto-update payments (e.g., mark Returned → refund prompt)
- CSV / PDF export of bookings & invoices
- Customer master list (de-duped customer profile across bookings)

### P2
- WhatsApp / SMS reminders for upcoming returns and overdue
- Multi-user with roles (staff vs owner)
- Photo upload per jewellery set
- Revenue charts (monthly trend)
- Inventory module — which sets are in-shop vs out
