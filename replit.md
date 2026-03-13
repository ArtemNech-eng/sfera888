# Workspace

## Overview

CRM система для управления ремонтными заказами. pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + Shadcn/UI
- **Auth**: Session-based (express-session + bcryptjs)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── crm/               # React CRM frontend (at /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed.ts         # Database seeding script
```

## User Roles

1. **admin** (login: `admin`, pass: `admin123`) — Full access
2. **lead_operator** (login: `operator1`, pass: `operator123`) — Leads management
3. **master_operator** (login: `master_op`, pass: `master123`) — Order buffer & masters

## CRM Features

- **Dashboard** (admin): stats cards, top masters, sales funnel
- **Leads** (admin, lead_operator): manage incoming leads, create new, change status, send to buffer
- **Order Buffer** (admin, master_operator): anonymized orders, assign masters
- **Masters** (admin, master_operator): master list with rating, status
- **Finance** (admin): transactions table, commission tracking
- **Analytics** (admin): sales funnel chart, master ratings
- **Settings** (admin): manage cities and service types
- **Users** (admin): manage operators

## DB Schema

- `users` - System users (admin, lead_operator, master_operator)
- `leads` - Client applications with contact info
- `orders` - Anonymized order buffer (without client contacts)
- `masters` - Master workers
- `transactions` - Commission transactions
- `cities` - City settings
- `service_types` - Service type settings

## Commission Rules

- Order ≤ 50,000₽ → 5,000₽ fixed
- Order 50,001–100,000₽ → 15%
- Order > 100,000₽ → Manual entry (default 15%)

## Running

- API: `pnpm --filter @workspace/api-server run dev`
- Frontend: `pnpm --filter @workspace/crm run dev`
- Seed DB: `pnpm --filter @workspace/scripts run seed`
- Push DB schema: `pnpm --filter @workspace/db run push`
