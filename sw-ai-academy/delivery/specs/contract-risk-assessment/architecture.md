# Architecture — Contract Risk Assessment Tool

**Version:** 1.0
**Source of truth:** [feature-spec.md](./feature-spec.md)
**Status:** Draft — ready for human review

---

## 1. Purpose

This document describes the MVP architecture for the Contract Risk Assessment Tool as defined in the feature specification. It establishes the major components, their responsibilities, the data flow between them, and the key decisions that shaped the design.

The architecture is intentionally minimal. It serves a single-user, local-first application whose core behaviours are contract upload, simulated risk analysis, and finding review. No authentication, no real document intelligence, and no shared infrastructure are introduced at this stage.

---

## 2. System Context

The tool runs as a self-contained application on a single machine. A user opens it in a browser, uploads contracts, views generated risk reports, and records review decisions. Nothing leaves the local environment in the MVP.

```
┌─────────────────────────────────────────────────┐
│                  User's Machine                  │
│                                                  │
│   Browser (Chrome)                               │
│   ┌─────────────────────────────────────────┐   │
│   │         React Frontend (SPA)            │   │
│   └──────────────────┬──────────────────────┘   │
│                       │ HTTP (localhost)          │
│   ┌──────────────────▼──────────────────────┐   │
│   │         Node.js Backend (REST)          │   │
│   └────────┬──────────────────┬─────────────┘   │
│            │                  │                  │
│   ┌────────▼──────┐  ┌────────▼──────────┐      │
│   │  SQLite DB    │  │  Local File Store │      │
│   │  (metadata,   │  │  (uploaded files) │      │
│   │   findings)   │  └───────────────────┘      │
│   └───────────────┘                              │
└─────────────────────────────────────────────────┘
```

The browser communicates with the backend over localhost HTTP. The backend owns all persistence: file storage and the SQLite database.

---

## 3. Major Components

| Component | Technology | Role |
|-----------|------------|------|
| **Upload UI** | React | File selection, validation feedback, and submission |
| **Contract Queue UI** | React | Displays all contracts and their live status |
| **Report UI** | React | Displays risk report, findings, and review actions |
| **API Server** | Node.js | Handles requests, orchestrates analysis, persists data |
| **Analysis Engine** | Node.js (in-process) | Simulates clause analysis against the 6 mock rules |
| **File Store** | Local folder | Persists uploaded PDF/DOCX files on disk |
| **Database** | SQLite | Persists contract metadata, reports, findings, and comments |

---

## 4. Component Responsibilities and Boundaries

### 4.1 Upload UI

- Presents a file picker restricted to `.pdf` and `.docx`
- Enforces the 10 MB size limit client-side before submission (spec FR-1, NFR-3)
- Displays a user-visible error for rejected files without changing the queue (spec AC-02, AC-10)
- Submits the file to the backend as a multipart upload
- Drives the simulated status animation (`Pending → Processing → Complete`) on the frontend after a successful upload response, using a fixed client-side timer of ~2–3 seconds (spec A-4, FR-2, NFR-1)

**Boundary:** The Upload UI does not decide whether a file is safe or valid beyond type and size. It does not trigger analysis directly — that is the backend's responsibility.

### 4.2 Contract Queue UI

- Polls or re-fetches the contract list from the backend to display updated status (spec FR-2, NFR-2)
- Shows contracts in reverse-chronological order; no sorting or filtering (spec FR-2, A-7)
- Renders file name, upload timestamp, and current status per row
- Provides navigation to the Report UI for completed contracts (spec AC-05)

**Boundary:** The Contract Queue UI owns display only. It does not compute or store state — all status data comes from the backend.

### 4.3 Report UI

- Renders the overall risk level, static summary text, and all 6 findings ranked by severity (High → Medium → Low) (spec FR-3)
- Applies visual differentiation to High-severity findings (spec FR-3, AC-06)
- Allows the user to set and change finding status (`Accepted`, `Overridden`, `Reviewed`) and add, edit, or clear comments (spec FR-4)
- Displays a live counter "X of 6 findings reviewed" that updates immediately on status change without a page reload (spec FR-4, AC-09)
- Persists all status and comment changes to the backend on each user action

**Boundary:** The Report UI does not recalculate the overall risk level — it is always `High` (spec A-2, FR-3). It does not batch changes; each status or comment update is persisted individually.

### 4.4 API Server

- Accepts multipart file uploads; performs server-side validation of file type and size (spec FR-1)
- Saves the uploaded file to the local File Store and records the contract metadata in SQLite
- Triggers the Analysis Engine synchronously after saving the file
- Exposes endpoints for: querying the contract queue, retrieving a report, and updating a finding's status or comment
- Returns appropriate error responses for validation failures

**Boundary:** The API Server does not implement authentication or access control (spec §3 Out of Scope). It does not parse document content — it delegates to the Analysis Engine.

### 4.5 Analysis Engine

- A pure in-process module within the backend; not a separate service
- Applies all 6 predefined mock rules to every contract regardless of file content (spec A-1, FR-3)
- Produces a fixed report: overall risk `High`, static summary text, and 6 findings in the defined severity order
- Each finding record is written to SQLite with default status `Unreviewed`

**Boundary:** The Analysis Engine does not read the file. It does not vary output by file type, content, or filename. The mock rules are hardcoded constants, not configurable at runtime.

### 4.6 File Store

- A designated folder within the application's local directory (spec A-6)
- Files are written once on upload; they are never modified or deleted in the MVP (spec §3 Out of Scope)
- File names on disk may be normalised (e.g., prefixed with a UUID) to avoid collisions, while the original file name is preserved in the database for display

**Boundary:** The File Store has no logic. It is a passive storage location managed entirely by the API Server.

### 4.7 Database (SQLite)

- A single SQLite file co-located with the application
- Stores: contract records (id, file name, upload timestamp, status), report records (contract id, overall risk, summary), finding records (report id, rule id, severity, explanation, section reference, review status, comment)
- All writes originate from the backend; the frontend never accesses the database directly

**Boundary:** SQLite is the single source of truth for persistent state. The frontend's in-memory state (e.g., the live status counter) is derived from database-backed data loaded at page open or after each mutation.

---

## 5. Data Flow

### 5.1 Upload and Analysis

```
User selects file
    │
    ▼
Upload UI: validates type + size (client-side)
    │  reject → display error, stop
    ▼
Upload UI: POST /contracts (multipart)
    │
    ▼
API Server: validates type + size (server-side)
    │  reject → return error response
    ▼
API Server: writes file to File Store
    ▼
API Server: inserts contract record into SQLite (status = Pending)
    ▼
API Server: calls Analysis Engine (synchronous, in-process)
    ▼
Analysis Engine: applies 6 mock rules, returns report + findings
    ▼
API Server: writes report + 6 finding records to SQLite
    ▼
API Server: updates contract status to Complete in SQLite
    ▼
API Server: returns success response to frontend
    │
    ▼
Upload UI: starts client-side timer (~2–3 s)
    ▼ (timer fires)
Contract Queue UI: reflects status Complete
```

> Note: The status animation (`Pending → Processing → Complete`) is driven by a frontend timer after the backend confirms success. The backend completes analysis synchronously before responding. This satisfies NFR-1 (Complete within 5 seconds) and A-4 (no backend polling required).

### 5.2 Viewing a Report

```
User clicks completed contract in queue
    │
    ▼
Report UI: GET /contracts/:id/report
    │
    ▼
API Server: queries SQLite for report + findings
    ▼
API Server: returns report object with ranked findings
    ▼
Report UI: renders risk level, summary, findings list, review counter
```

### 5.3 Recording a Review Action

```
User sets finding status or saves comment
    │
    ▼
Report UI: PATCH /findings/:id
    ▼
API Server: updates finding record in SQLite
    ▼
Report UI: updates local state immediately (optimistic update)
    ▼
Review counter recalculates from local state
```

### 5.4 Persistence Across Refresh (NFR-4)

All display state (contract list, report content, finding statuses, comments) is loaded from the backend on page open. The frontend holds no durable state of its own — it is fully reconstructed from SQLite on each fresh load.

---

## 6. Cross-Cutting Requirements

### 6.1 Data Persistence (NFR-4)

All contract records, reports, findings, statuses, and comments are written to SQLite immediately and are not held in memory only. The frontend treats its in-memory view as a cache, not the record of truth.

### 6.2 Status Visibility Without Reload (NFR-2)

The queue status transition is driven by a client-side timer after a successful upload response. No polling or server-sent events are required because the simulation is front-end-controlled per spec A-4. The backend has already completed analysis before the frontend begins the animation.

### 6.3 File Validation (FR-1, NFR-3, NFR-5)

Validation is applied at two points:
1. **Client-side** (Upload UI) — prevents unnecessary network requests for clearly invalid files
2. **Server-side** (API Server) — the authoritative gate; a file is not persisted if server-side validation fails

Both layers check MIME type (or file extension) and file size (≤ 10 MB).

### 6.4 Browser Compatibility (NFR-6)

The React frontend targets the latest stable Chrome. No polyfills for legacy browsers are required for the MVP.

### 6.5 Error States

User-visible error messages are required for: invalid file type (AC-02) and oversized file (AC-10). All other backend errors should surface a generic message in the UI. The queue must not change on any rejected upload.

---

## 7. Key Architecture Decisions

### AD-1 — Synchronous analysis, frontend-driven status animation

**Decision:** The backend performs analysis synchronously within the upload request. The frontend plays the `Pending → Processing → Complete` animation using a local timer after receiving a success response.

**Rationale:** Spec A-4 explicitly states "no backend polling is required" and the processing simulation is a deliberate frontend delay. Async queuing or polling would add complexity with no benefit at this scope.

**Traceability:** FR-2, NFR-1, NFR-2, A-4

---

### AD-2 — Single SQLite file for all persistence

**Decision:** SQLite is the only data store. No separate caching layer or secondary store is used.

**Rationale:** The application is single-user, local-only, and low-volume (demo-scale contract queue). SQLite is sufficient, zero-configuration, and keeps deployment trivially simple.

**Traceability:** FR-2, NFR-4, A-5, A-6

---

### AD-3 — Analysis Engine is an in-process module, not a service

**Decision:** The Analysis Engine is a Node.js module called directly by the API Server — not a microservice, worker process, or external API.

**Rationale:** All 6 rules are static and require no I/O. Separating it into a process would add operational overhead with no scaling or isolation benefit at MVP scope.

**Traceability:** A-1, FR-3

---

### AD-4 — File Store is a local folder, no cloud storage

**Decision:** Uploaded files are written to a local folder within the application directory.

**Rationale:** Spec A-6 and the MVP constraints explicitly exclude cloud object storage.

**Traceability:** FR-1, A-6

---

### AD-5 — No authentication or authorisation

**Decision:** The application has no login, session, or permission layer.

**Rationale:** Spec §3 Out of Scope explicitly excludes authentication and RBAC. The tool is scoped for local demo use by a single user.

**Traceability:** Feature spec §3 Out of Scope, A-5

---

### AD-6 — Overall risk level is static, not derived from finding statuses

**Decision:** The overall risk level displayed in all reports is always `High`. It is not recalculated if a user overrides findings.

**Rationale:** Spec FR-3 and A-2 define this explicitly as MVP behaviour.

**Traceability:** FR-3, A-2

---

## 8. Assumptions and Decisions for Human Review

The following items require confirmation or a deliberate decision before implementation begins.

| # | Item | Recommended default | Requires decision from |
|---|------|---------------------|------------------------|
| H-1 | The status animation uses a client-side timer (~2–3 s). Should the `Processing` state last a fixed duration, or should it fill the full 5-second window to match NFR-1? | Use a ~2–3 s timer; `Complete` appears before the 5 s ceiling | `[Product Owner]` |
| H-2 | OQ-1 from spec: Is a visible spinner or animation required during the `Processing` state? This affects the Report UI and Queue UI designs. | Yes — add a simple spinner to reinforce the simulated async feel | `[Product Owner]` |
| H-3 | OQ-2 from spec: How many contracts are expected in the queue during a demo? Affects whether the queue needs scroll handling. | Assume ≤ 20 for MVP; add basic scroll if the list overflows the viewport | `[Product Owner]` |
| H-4 | When the user navigates from the Report UI back to the queue, should the queue re-fetch from the backend or rely on cached state? | Re-fetch on navigation to ensure accuracy | `[Tech Lead]` |
| H-5 | Finding PATCH operations are individual (one per status/comment change). Should comment saves require an explicit "Save" button, or should they auto-save on blur? | Require an explicit "Save" action to avoid accidental overwrites | `[Product Owner]` |
| H-6 | The local File Store folder path should be configurable via environment variable rather than hardcoded, to support different deployment environments. | Use `FILE_STORE_PATH` env var with a default of `./data/uploads` | `[Tech Lead]` |

---

*Last updated: 2025-07 · Version: 1.0 · Owner: `[Tech Lead]`*
