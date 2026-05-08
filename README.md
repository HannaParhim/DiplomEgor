# TenantLMS MVP

Multi-tenant LMS for employee training. One platform serves many companies, each isolated by `companyId` across users, roles, departments, courses, assignments, progress, and reports.

## Stack

- Backend: Node.js, Express, Prisma, SQLite, JWT, bcryptjs, Multer
- Frontend: React, Vite, Tailwind CSS
- Storage: local SQLite file at `database/database.sqlite`
- Uploads: local filesystem in `uploads/`

## Project structure

```text
client/
server/
database/
uploads/
```

Backend structure:

```text
server/
├ controllers/
├ routes/
├ middleware/
├ services/
├ models/
├ database/
├ utils/
├ prisma/
├ config/
├ app.js
└ server.js
```

## Features in this MVP

- Company registration that creates:
  - tenant company
  - default roles
  - first administrator
- JWT authentication with tenant-scoped middleware
- RBAC with JSON-like permissions stored in SQLite as serialized JSON text
- User management
- Role management
- Department management
- Course CRUD
- Modules and lessons
- Course assignment
- Progress tracking
- Certificate issuance record
- File uploads for PDF, video, slides, and images
- Dashboard and reporting pages

## Local run

### 1. Prepare environment

PowerShell:

```powershell
Copy-Item server\.env.example server\.env
Copy-Item client\.env.example client\.env
```

### 2. Install and start backend

```powershell
cd server
npm install
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

### 3. Install and start frontend

Open a second terminal:

```powershell
cd client
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Backend API: `http://localhost:4000/api`

Health check: `http://localhost:4000/health`

## Demo accounts from seed

Tenant domain: `acme-demo`

- Admin: `admin@acme.test` / `Admin12345!`
- Manager: `manager@acme.test` / `Manager12345!`
- HR: `hr@acme.test` / `Hr12345!`
- Employee: `employee@acme.test` / `Employee12345!`

## Key API endpoints

- `POST /api/auth/register-company`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET|POST|PUT|DELETE /api/users`
- `GET|POST|PUT|DELETE /api/roles`
- `GET|POST|PUT|DELETE /api/departments`
- `GET|POST|PUT|DELETE /api/courses`
- `POST /api/courses/:courseId/modules`
- `POST /api/courses/:courseId/modules/:moduleId/lessons`
- `POST /api/courses/assign`
- `GET /api/progress/:courseId`
- `POST /api/progress/lessons/:lessonId/complete`
- `GET /api/dashboard/overview`
- `GET /api/reports/summary`
- `POST /api/uploads`

## Database

- Prisma schema: `server/prisma/schema.prisma`
- Raw SQLite schema: `database/schema.sql`

The SQLite permissions field is stored as serialized JSON text for SQLite compatibility. Service and middleware layers parse it into objects, and the same domain model can later move to PostgreSQL JSONB with minimal service changes.

## Scaling path

- Switch Prisma datasource to PostgreSQL
- Replace local uploads with S3-compatible storage
- Add background jobs for notifications and certificate rendering
- Add WebSocket notifications with Socket.io if needed

## Notes

- Docker is intentionally not used in this project.
- The frontend uses Vite proxying for `/api` and `/uploads` in local development.
