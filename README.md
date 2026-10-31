# Project Tracking Platform (Hallmark Console)

A modern developer console and project tracking platform built with **Next.js 14 App Router**, **JavaScript/JSX**, **Tailwind CSS**, and **MongoDB/Mongoose**.

The platform provides a centralized, private workspace for tracking discrete software deliverables, sprint milestones, task execution velocities, and audit telemetry under an owner-authenticated security boundary.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Application Screenshots](#application-screenshots)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation & Local Development](#installation--local-development)
- [Environment Variables](#environment-variables)
- [GitHub OAuth Setup](#github-oauth-setup)
- [MongoDB Architecture & Transactions](#mongodb-architecture--transactions)
- [Testing Guide](#testing-guide)
- [Production Build & Deployment](#production-build--deployment)
- [Project Structure](#project-structure)
- [Known Limitations](#known-limitations)
- [License](#license)

---

## Project Overview

Individual software developers and engineering leads frequently build across multiple repositories, services, and experimental branches without a consolidated dashboard to monitor delivery state.

**Project Tracking Platform** solves this by providing:
- A high-density, terminal-inspired interface (**Hallmark Console**) adhering to strict typographic and visual hierarchy tokens.
- Secure single-owner access backed by GitHub OAuth, ensuring administrative boundaries are enforced at both the HTTP middleware and database query layers.
- Task-driven progress calculation with automated completion timestamps.
- Roadmap milestone planning with target dates and status lifecycle tracking.
- Multi-document ACID transactional cascade deletion on replica sets, with fail-closed safety safeguards on standalone MongoDB instances.
- Zero-dependency accessible dialogs with cyclic keyboard focus traps and focus restoration.

> [!IMPORTANT]
> **Owner-Private Scope**: This platform is designed around a single-owner administrative model. All project catalogs, detail views, task lists, milestone roadmaps, and workspace metrics are **strictly private** to the verified account configured in `OWNER_GITHUB_ID`. There is currently **no public project catalog** for anonymous visitors; unauthenticated visitors can only view the static marketing landing page (`/`) and login screen (`/login`).

---

## Key Features

- **GitHub OAuth Authentication & Owner Authorization**:
  - Encrypted JWT session cookies using NextAuth.js v4.
  - Automatic synchronization of authenticated GitHub profile data into the Mongoose `User` collection.
  - Strict server-side verification: only the GitHub user matching `OWNER_GITHUB_ID` is granted access.
  - Non-owner visitors receive an explicit, friendly HTTP 403 Forbidden screen without leaking private workspace telemetry.
  - Production guard: in-process test session injection hooks are strictly disabled in production (`NODE_ENV === "production"`).
- **Project Catalog & Management**:
  - Create, view, and edit projects with URL-friendly slugs, descriptions, tech stacks, repository URLs, documentation links, categories, and priority ratings.
  - Real-time catalog filtering by status, priority, visibility, and category.
  - Debounced search query parsing across project titles, descriptions, and slugs.
  - Multi-field sorting by update date, creation date, title, or priority.
- **Task Management & Automated Timestamps**:
  - Full CRUD operations for discrete deliverables under any authorized project.
  - Status transitions: `Todo`, `In Progress`, `Done`.
  - Automatic `completedAt` timestamp assignment upon marking tasks `Done`, with automatic clearing if a task is reopened.
  - Priority flags: `Low`, `Medium`, `High`, `Critical`.
- **Milestone Roadmap**:
  - High-level delivery phases and sprint targets with target dates.
  - Status lifecycle: `Planned`, `In Progress`, `Completed`.
  - Timestamp tracking upon milestone completion.
- **Dynamic Task-Driven Progress**:
  - Project progress percentage is dynamically calculated as the ratio of completed tasks (`status === "Done"`) to total tasks.
  - If a project has zero tasks, it seamlessly preserves a manual baseline progress percentage.
- **Workspace Analytics Dashboard**:
  - Real-time metric cards showing total tracked repositories, task velocity completion ratios, milestone roadmap schedule fidelity, and median delivery velocity.
  - Urgent upcoming deadlines widget surfacing tasks due within 7 days and overdue items.
  - Recent activity stream auditing creation, modification, and completion events.
- **Transaction-Safe Project Cascade Deletion**:
  - Deleting a project automatically coordinates atomic cascade deletion of all child tasks, milestones, and audit activities.
  - Enforces MongoDB multi-document ACID transactions on replica sets and MongoDB Atlas.
  - Safely fails closed with HTTP 501 on standalone MongoDB instances, performing zero document mutations to prevent orphaned records.
- **Accessible Modal Dialogs**:
  - Custom React focus management hook (`useDialogFocus`) without heavy third-party UI dependencies.
  - Cyclic <kbd>Tab</kbd> and <kbd>Shift</kbd> + <kbd>Tab</kbd> keyboard focus trapping inside dialogs.
  - Safe initial focus placement (e.g. Cancel button on delete confirmations, title input on creation modals).
  - Smooth focus restoration to the triggering button upon dialog dismissal.
  - WAI-ARIA 1.2 compliance: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-describedby`.

---

## Application Screenshots

<!-- 
Screenshot Placeholders: Replace with actual capture files when documenting live deployments.
Do not link uncommitted local files or fake images.
-->

### 1. Workspace Overview Dashboard
<!-- Placeholder: [Screenshot of /dashboard showing overview statistics, urgent deadlines, and recent activities] -->
```
+---------------------------------------------------------------------------------------+
| WORKSPACE OVERVIEW // PRIVATE CONSOLE                              [User Profile]     |
+---------------------------------------------------------------------------------------+
|  [Tracked Projects]       [Task Velocity]       [Milestone Schedule]  [Active Sprint] |
|        12 Repos                68% Completed          94% On Track        4 Active    |
+---------------------------------------------------------------------------------------+
| Recent Projects                         | Urgent Deadlines & Telemetry                |
| • E2E Automated Test Platform (75%)     | • Due in 2 days: OAuth Refresh Rotation     |
| • Distributed Event Pipeline (100%)     | • Activity: Task marked Done 14m ago        |
+---------------------------------------------------------------------------------------+
```

### 2. Project Catalog & Filter Bar
<!-- Placeholder: [Screenshot of /dashboard/projects with search query and status pill filters] -->

### 3. Project Detail View & Task Management
<!-- Placeholder: [Screenshot of /dashboard/projects/[id] displaying progress bar, task board, and milestones] -->

### 4. Accessible Task Modal & Delete Dialog
<!-- Placeholder: [Screenshot of open modal with visible Hallmark Console focus rings] -->

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | Next.js (App Router) | `14.2.35` | Full-stack React framework with server components and API route handlers. |
| **Language** | JavaScript (ESM / JSX) | ES2022+ | Zero TypeScript overhead; clean, modern ES module syntax throughout. |
| **UI & Styling** | Tailwind CSS | `3.4.17` | Utility-first CSS configured with custom Hallmark Console theme tokens. |
| **UI Utilities** | CVA, clsx, tailwind-merge | `^0.7.1` | Component variance authority and class merging (`cn()`) utility. |
| **Icons** | Lucide React | `^0.475.0` | High-density developer and terminal iconography. |
| **Database** | MongoDB | `7.0+` / `8.0+` | Document database supporting multi-document ACID transactions. |
| **ODM** | Mongoose | `^8.24.7` | Schema validation, compound indexes, and transaction session management. |
| **Authentication** | NextAuth.js | `^4.24.15` | JWT session management with GitHub OAuth provider. |
| **Test Runner** | Node.js Test Runner | `node:test` | Native ESM test suite runner with zero third-party test dependencies. |
| **E2E Testing** | Chrome DevTools Protocol | CDP WebSocket | Headless Chrome browser testing driving end-to-end user flows. |

---

## Prerequisites

Before setting up the project locally, verify you have installed:

- **Node.js**: `v18.17.0` or higher (`v20.x` or `v22.x` recommended for native `process.loadEnvFile` support).
- **npm**: `v9.x` or `v10.x`.
- **MongoDB**: `v7.0` or higher:
  - *Local Development*: MongoDB Community Server (standalone is supported for everything except cascade deletion).
  - *Full Fidelity / Production*: MongoDB Atlas or a local replica set (required for transactional cascade deletion).
- **Google Chrome**: Required only if you intend to run the automated Chrome CDP browser verification suite (`npm run test:e2e`).
- **GitHub Account**: Required to register a GitHub OAuth application for login.

---

## Installation & Local Development

### 1. Clone the repository
```bash
git clone https://github.com/sumitkhandi48/Project-Tracker.git
cd Project-Tracker
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Copy the template `.env.example` to create your local `.env.local`:

**PowerShell (Windows)**:
```powershell
Copy-Item .env.example .env.local
```

**Bash (Linux / macOS)**:
```bash
cp .env.example .env.local
```

Open `.env.local` in your editor and configure your database URI, NextAuth secret, GitHub OAuth credentials, and your numeric GitHub account ID (see [Environment Variables](#environment-variables) below).

### 4. Verify MongoDB is running
Ensure your local MongoDB instance is active on port `27017`:
```bash
# Verify connection using mongosh
mongosh --eval "db.adminCommand('ping')"
```

### 5. Start the Next.js development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

All environment variables used by the application are documented in [`.env.example`](file:///.env.example). Configure these inside `.env.local`:

| Variable | Requirement | Default / Example | Purpose |
|---|---|---|---|
| `MONGODB_URI` | **Mandatory** | `mongodb://127.0.0.1:27017/project_tracker` | MongoDB connection string. For production or full cascade deletion, point to a replica set or MongoDB Atlas. |
| `NEXTAUTH_URL` | **Mandatory** | `http://localhost:3000` | Canonical application URL. In production, set to your live domain (e.g. `https://tracker.yourdomain.com`). |
| `NEXTAUTH_SECRET` | **Mandatory** | *Random 32-byte string* | Secret key for signing NextAuth JWT cookies. Generate via `openssl rand -base64 32`. |
| `GITHUB_CLIENT_ID` | **Mandatory** | `Ov23li...` | Client ID from your registered GitHub OAuth Application. |
| `GITHUB_CLIENT_SECRET` | **Mandatory** | *Secret string* | Client Secret from your registered GitHub OAuth Application. |
| `OWNER_GITHUB_ID` | **Mandatory** | `12345678` | Numeric GitHub account ID of the authorized owner/administrator. |
| `MONGODB_REPLICA_TEST_URI` | **Optional** | `mongodb://127.0.0.1:27018/...` | Dedicated test replica set URI used only by `tests/cascade-deletion-replica-set.test.js`. |

> [!CAUTION]
> Never commit `.env.local` to source control. `.env.local` is listed in `.gitignore` and must remain strictly untracked.

---

## GitHub OAuth Setup

To enable authentication on your local machine:

1. Navigate to your GitHub account: **Settings > Developer Settings > OAuth Apps**.
2. Click **New OAuth App**.
3. Fill in the application details:
   - **Application name**: `Project Tracker Console (Local)`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Click **Register application**.
5. Copy the generated **Client ID** into `GITHUB_CLIENT_ID` in `.env.local`.
6. Click **Generate a new client secret**, copy the value into `GITHUB_CLIENT_SECRET` in `.env.local`.
7. Retrieve your numeric GitHub user ID:
   ```bash
   # Using curl and jq
   curl -s https://api.github.com/users/<your-github-username> | jq .id
   ```
   Or visit `https://api.github.com/users/<your-github-username>` in your browser and look for the `"id"` field.
8. Set `OWNER_GITHUB_ID=<your-numeric-id>` in `.env.local`.

---

## MongoDB Architecture & Transactions

### Entity Relationship Model

```
       +-------------------------+
       |          User           |
       |  (_id, githubId, email) |
       +-------------------------+
                    |
                    | 1:N (owns)
                    v
       +-------------------------+
       |         Project         |
       |  (_id, owner, slug)     |
       +-------------------------+
         |           |          |
     1:N |       1:N |      1:N |
         v           v          v
   +----------+ +-----------+ +------------+
   |   Task   | | Milestone | |  Activity  |
   +----------+ +-----------+ +------------+
```

- **User**: Stores authenticated GitHub identity (`githubId`, `name`, `email`, `image`).
- **Project**: Core deliverable entity (`owner`, `title`, `slug`, `status`, `visibility`, `priority`, `tags`, `isDeleting`).
- **Task**: Granular deliverable (`project`, `owner`, `title`, `status`, `priority`, `dueDate`, `completedAt`).
- **Milestone**: Roadmap phase (`project`, `owner`, `title`, `targetDate`, `status`, `completedAt`).
- **Activity**: Telemetry audit log (`owner`, `project`, `type`, `message`, `metadata`).

### Owner Scoping & Isolation
To maintain strict tenant isolation and guarantee high query performance without expensive joins:
- Every document in `Project`, `Task`, `Milestone`, and `Activity` maintains an indexed `owner` field referencing `User._id`.
- All database operations (`find`, `findOne`, `findOneAndUpdate`, `deleteMany`, `findOneAndDelete`) enforce `{ owner: ownerId }`.
- Attempted operations on resources belonging to another user return **HTTP 404** rather than 403, preventing resource enumeration (IDOR protection).

### Progress Calculation Logic
Project progress is calculated via `calculateProjectProgress()`:
$$\text{Progress \%} = \text{round}\left(\frac{\text{Completed Tasks}}{\text{Total Tasks}} \times 100\right)$$
- When tasks exist, progress is strictly task-driven.
- When zero tasks exist on a project, the manually set `manualProgress` value (0–100%) is preserved as a fallback.

### Multi-Document ACID Transactions & Cascade Deletion

When a user deletes a project:
1. The platform acquires a document write lock on the project by setting `isDeleting: true` with an atomic filter `{ _id: projectId, owner: ownerId, isDeleting: { $ne: true } }`. This serializes against concurrent task or milestone creation.
2. It deletes all child `Task` records scoped to `{ project: projectId, owner: ownerId }`.
3. It deletes all child `Milestone` records scoped to `{ project: projectId, owner: ownerId }`.
4. It deletes all child `Activity` records scoped to `{ project: projectId, owner: ownerId }`.
5. It deletes the `Project` document and commits the transaction.

If any failure occurs during steps 1–5, the WiredTiger transaction aborts and all operations roll back atomically, leaving zero orphaned records.

#### Why Standalone MongoDB Returns HTTP 501
Standalone MongoDB instances (default Community Server on port 27017) do not support multi-document transactions. Rather than performing non-atomic, partial deletions that could corrupt data if interrupted, **the system fails closed and returns HTTP 501**:
```json
{
  "error": "Atomic cascade deletion requires MongoDB transaction support (replica set or mongos). Standalone deployments are not supported."
}
```

#### Configuring a Local Replica Set for Testing (Alternate Port 27018)
To run full replica set integration tests locally without interrupting your standard standalone MongoDB service on port `27017`:

**PowerShell (Windows)**:
```powershell
# 1. Create a dedicated data directory
New-Item -ItemType Directory -Path "C:\data\rs-test" -Force

# 2. Start an isolated mongod instance configured as a replica set on port 27018
mongod --port 27018 --dbpath "C:\data\rs-test" --replSet rsTest

# 3. In a separate terminal, initiate the replica set
mongosh --port 27018 --eval "rs.initiate()"

# 4. Run replica-set integration tests
$env:MONGODB_REPLICA_TEST_URI="mongodb://127.0.0.1:27018/project_tracker_test?replicaSet=rsTest"
npm test
```

**Bash (Linux / macOS)**:
```bash
# 1. Create a dedicated data directory
mkdir -p /tmp/mongodb-rs-test

# 2. Start an isolated mongod instance on port 27018
mongod --port 27018 --dbpath /tmp/mongodb-rs-test --replSet rsTest --fork --logpath /tmp/mongodb-rs-test.log

# 3. Initiate the replica set
mongosh --port 27018 --eval "rs.initiate()"

# 4. Run replica-set integration tests
MONGODB_REPLICA_TEST_URI="mongodb://127.0.0.1:27018/project_tracker_test?replicaSet=rsTest" npm test
```

---

## Testing Guide

The repository includes a comprehensive, multi-tiered test suite powered by the native Node.js test runner (`node:test`) and the Chrome DevTools Protocol.

### 1. Run the Full Test Suite
```bash
npm test
```
- Executes 59 test suites and 259 automated test cases in ~1.8 seconds.
- **Why 5 tests are skipped**: In standard local execution without `MONGODB_REPLICA_TEST_URI`, the 5 genuine replica-set transaction tests in `tests/cascade-deletion-replica-set.test.js` are intentionally skipped because the local MongoDB instance is standalone. All 254 active tests pass.

### 2. Run Focused Test Suites
You can run any individual test suite using Node's test runner:
```bash
# Cascade deletion & transaction hooks
node --test tests/cascade-deletion.test.js

# Project CRUD and query parsing
node --test tests/projects-api.test.js

# Task & Milestone validation schemas
node --test tests/task-milestone-validation.test.js

# Modal dialog focus trapping & accessibility
node --test tests/dialog-accessibility.test.js

# NextAuth callbacks & owner authorization
node --test tests/auth.test.js
```

### 3. Run Genuine Replica-Set Transaction Tests
When a replica set is available, pass `MONGODB_REPLICA_TEST_URI`:
```bash
# Windows PowerShell
$env:MONGODB_REPLICA_TEST_URI="mongodb://127.0.0.1:27018/project_tracker_test?replicaSet=rsTest"
node --test tests/cascade-deletion-replica-set.test.js

# Linux / macOS
MONGODB_REPLICA_TEST_URI="mongodb://127.0.0.1:27018/project_tracker_test?replicaSet=rsTest" node --test tests/cascade-deletion-replica-set.test.js
```
All 5 transaction integration tests will execute and pass without skips.

### 4. Run Chrome CDP End-to-End Browser Verification
```bash
npm run test:e2e
```
- Automatically builds and spawns the Next.js production server on port `3005`.
- Launches Google Chrome in headless mode with remote debugging enabled on port `9224`.
- Connects directly via native Chrome DevTools Protocol (CDP) WebSocket.
- Executes 54 real-browser checks across 14 user flows:
  - Unauthenticated redirect to `/login`
  - 403 Forbidden screen verification for non-owners
  - Authenticated session cookie synthesis
  - Project creation, catalog filtering, and editing
  - Task and milestone lifecycles with dynamic progress derivation
  - Standalone HTTP 501 cascade deletion fail-closed safeguard
  - Dialog accessibility: Tab/Shift+Tab focus trap, initial focus, Escape dismissal, and focus restoration
  - Viewport responsive audit (Desktop 1440x900, Mobile 375x667)
  - Zero unhandled exceptions and zero severe console errors audit
  - Client response credential leak audit (`NEXTAUTH_SECRET`, `MONGODB_URI` never exposed)

---

## Production Build & Deployment

### 1. Build the Application
```bash
npm run build
```
Compiles and generates optimized static and server-rendered routes:
- Verifies TypeScript and React JSX validity.
- Outputs lightweight client bundles (< 125 kB first-load JS).
- Compiles middleware and API route handlers.

### 2. Start the Production Server
```bash
npm start
```
Starts the production Next.js server on `http://localhost:3000` (or the port defined by `PORT`).

### 3. Deployment Requirements (Vercel / Docker / Cloud)

- **Database**: Production deployments require **MongoDB Atlas** (M0 free cluster or higher) or a self-hosted replica set. Single-node standalone instances are not supported for project deletion.
- **Production Environment Variables**:
  Configure the following variables in your hosting provider's dashboard (e.g. Vercel Project Settings):
  - `MONGODB_URI`: Points to your MongoDB Atlas cluster (`mongodb+srv://...`).
  - `NEXTAUTH_URL`: Your production URL (e.g. `https://tracker.yourdomain.com`).
  - `NEXTAUTH_SECRET`: Strong random secret.
  - `GITHUB_CLIENT_ID`: Production GitHub OAuth client ID.
  - `GITHUB_CLIENT_SECRET`: Production GitHub OAuth client secret.
  - `OWNER_GITHUB_ID`: Your numeric GitHub account ID.
- **GitHub OAuth App**:
  Update your GitHub OAuth App settings with your live domain:
  - Homepage URL: `https://tracker.yourdomain.com`
  - Authorization callback URL: `https://tracker.yourdomain.com/api/auth/callback/github`

---

## Project Structure

```
project-tracking-platform/
├── .env.example                     # Environment configuration template
├── .gitignore                       # Git exclusion rules
├── package.json                     # Dependencies, scripts, and project metadata
├── tailwind.config.js               # Hallmark Console design tokens and colors
├── scripts/
│   └── run-e2e-verification.js      # Chrome CDP headless end-to-end browser verification
├── src/
│   ├── app/
│   │   ├── layout.jsx               # Root HTML layout with Hallmark Console font setup
│   │   ├── page.jsx                 # Public landing page with showcase demo projects
│   │   ├── login/                   # Authentication sign-in screen
│   │   ├── dashboard/               # Private workspace dashboard
│   │   │   ├── page.jsx             # Overview statistics, recent projects, activities
│   │   │   └── projects/            # Project catalog, creation, detail, and editing
│   │   └── api/                     # Server-side REST API route handlers
│   │       ├── auth/[...nextauth]/  # NextAuth GitHub OAuth route handler
│   │       ├── dashboard/           # Dashboard aggregation metrics API
│   │       ├── projects/            # Project CRUD, filtering, sorting, pagination
│   │       │   └── [id]/            # Individual project operations & cascade deletion
│   │       │       ├── tasks/       # Project task collection API
│   │       │       └── milestones/  # Project milestone collection API
│   │       ├── tasks/[id]/          # Task update and deletion API
│   │       └── milestones/[id]/     # Milestone update and deletion API
│   ├── components/
│   │   ├── auth/                    # SignIn and SignOut button components
│   │   ├── dashboard/               # Dashboard stats cards, project grid, activity feed
│   │   ├── projects/                # Detail views, forms, modals, delete dialog
│   │   └── ui/                      # Base Hallmark Console primitives (Button, Badge, Card, Input)
│   ├── lib/
│   │   ├── api/                     # Backend validation schemas and domain services
│   │   │   ├── owner-resolver.js    # Resolves Mongoose User ID from session
│   │   │   ├── project-cascade.js   # Transactional cascade deletion service
│   │   │   ├── project-service.js   # Project catalog queries and aggregations
│   │   │   ├── dashboard-service.js # Dashboard metrics computation
│   │   │   └── *-validation.js      # Whitelisting payload validators
│   │   ├── auth/                    # NextAuth options and checkOwnerAccess() boundary
│   │   ├── db/                      # Cached Mongoose MongoDB connection manager
│   │   └── utils/                   # Utilities (slugify, dialog-focus, project-progress)
│   └── models/                      # Mongoose schemas (User, Project, Task, Milestone, Activity)
└── tests/                           # 14 automated unit, integration, and UI test suites
```

---

## Known Limitations

1. **Standalone MongoDB Cascade Deletion**:
   Project cascade deletion requires multi-document ACID transactions. On standalone MongoDB instances, deletion requests fail closed with HTTP 501. Full functionality requires a replica set or MongoDB Atlas.
2. **Single-Owner Access Model**:
   The platform is architected as an owner-exclusive console. Multi-user collaboration, team permissions, and role-based access control (RBAC) are not supported.
3. **No Public Project Catalog**:
   While the schema supports `visibility: "Public"`, all `/dashboard` routes and API endpoints enforce owner authorization. Anonymous visitors cannot browse projects.
4. **GitHub Authentication Dependency**:
   Authentication requires GitHub OAuth; local username/password or alternative OAuth providers are not configured.

---

## License

Private and proprietary. Developed for individual technical project tracking.
