# WST Workshop Manager

A university workshop-management and practical-training system: customers/vehicles, workshop jobs (bays, technicians, approvals, labor, quality checks, invoices/payments), inventory and purchasing, training (terms, courses, mentors, students, enrollments, sessions), and advisory AI predictions.

This is a public export of an active development project, built as a demo/reference implementation. It includes real, working functionality backed by a PostgreSQL database and a synthetic demo dataset — nothing here uses real customer, staff, or student data.

## Stack

- **Backend**: NestJS, TypeScript, PostgreSQL (`backend/`)
- **Frontend**: React, TypeScript, Vite (`frontend/`)
- **Schema**: `schema/schema.sql` — the authoritative PostgreSQL schema

## Prerequisites

- Node.js `>= 24.7.0`
- PostgreSQL `>= 14`
- npm

## Setup

### 1. Create the database and apply the schema

Use whatever database name you like — just make sure it matches `DB_NAME` in `backend/.env` in the next step (the example below uses the same default as `backend/.env.example`):

```bash
createdb DataBase_WorkShop_Management
psql -d DataBase_WorkShop_Management -f schema/schema.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
- Set `DB_PASSWORD` (and `DB_NAME`/`DB_USER`/`DB_HOST`/`DB_PORT` if different from the defaults).
- Generate `AUTH_JWT_SECRET`:
  ```bash
  node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
  ```
  (Leave `ATTACHMENTS_SIGNING_SECRET` blank — it falls back to `AUTH_JWT_SECRET`.)

Then:

```bash
npm install
npm run seed        # populates a synthetic demo dataset — safe to run repeatedly
npm run start:dev    # http://localhost:3000
```

### 3. Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to the backend automatically
```

### 4. Log in

Open **http://localhost:5173** and sign in with any seeded demo account (full list and role descriptions in [`backend/docs/DEMO_SEED.md`](backend/docs/DEMO_SEED.md)):

| Email | Role | Password |
|---|---|---|
| `demo.admin@demo.wst.local` | System admin (governance: access/audit/config) | `DemoPass!2026Seed` |
| `demo.manager@demo.wst.local` | Workshop manager (full business modules) | `DemoPass!2026Seed` |

All seeded accounts share the same password. It's a development-only credential — never used for anything resembling a production secret.

You can also register your own account at `/register`: it lands in a "pending access" state until an admin account grants it a role under **Access Management → Users**.

## Running the tests

```bash
# Backend
cd backend
npm test -- --runInBand   # unit/integration
npm run test:e2e          # requires a running Postgres instance

# Frontend
cd frontend
npm test -- --run                              # unit/component
npm run test:e2e            # requires both dev servers running (see e2e/README.md)
```

## What's implemented vs. advisory-only

The frontend includes screens for the full product scope (training scheduling conflicts/overrides, attendance, assessments, competencies, certificates, full dashboards, AI predictions, etc.). Where the corresponding backend endpoint isn't live yet, the UI shows an honest "not yet available" state rather than fake data — it will light up automatically as backend work continues. AI predictions are always advisory: they never mutate operational data automatically.

## Docker

A one-command Docker Compose setup is planned but not included in this export yet, so it can go through the same testing/review process as everything else here rather than shipping untested. Until then, use the manual setup above.

## Deployment

See [`frontend/docs/DEPLOYMENT.md`](frontend/docs/DEPLOYMENT.md) for production build, static hosting/SPA fallback, environment configuration, and CI command sequence.

## License

All rights reserved. This is a demo/reference export of a private academic project.
