# Implementation Plan — Contract Risk Assessment Tool

**Version:** 1.0
**Source documents:** [feature-spec.md](./feature-spec.md) · [architecture.md](./architecture.md) · [design.md](./design.md)
**Status:** Draft — ready for tech lead review

---

## 1. Summary

The Contract Risk Assessment Tool is a local, single-user web application that accepts contract uploads, runs a simulated risk analysis against six hardcoded mock rules, and presents a structured finding report that reviewers can annotate. It is a demo-scope MVP with no real document parsing, no authentication, and no cloud infrastructure.

The application consists of a React SPA (browser), a Node.js REST API (localhost), an in-process analysis module, a SQLite database, and a local file store. All components run on one machine. Data persists across page refreshes via SQLite; the frontend holds no durable state of its own.

**Outcome:** A user can upload a PDF or DOCX contract, see a risk report within five seconds, and record review decisions — all within a single browser session.

---

## 2. Technical Context

| Dimension | Detail | Source |
|-----------|--------|--------|
| Runtime environment | Single machine, local-only; browser on localhost | architecture §2 |
| Frontend | React SPA served in Chrome (latest stable) | architecture §3, feature-spec NFR-6 |
| Backend | Node.js HTTP server (REST) on localhost | architecture §3 |
| Persistence | Single SQLite file co-located with the application | architecture §4.7, AD-2 |
| File storage | Local folder on disk; files written once and never modified | architecture §4.6, AD-4 |
| Analysis | In-process Node.js module; no I/O, no external calls | architecture §4.5, AD-3 |
| Authentication | None — explicitly out of scope | feature-spec §3, AD-5 |
| Concurrent users | Single user only; no concurrency handling needed | feature-spec §3, A-5 |

---

## 3. Components and Boundaries

### 3.1 Upload UI (React)

Responsible for file selection, client-side validation, submission, and driving the post-upload status animation.

**Owns:** File type and size validation before network submission; triggering the `Pending → Processing → Complete` animation on a client-side timer (~2–3 s) after receiving a success response from the server.

**Does not own:** Determining whether the file is safe beyond type and size; triggering analysis (that is the API Server's responsibility); any persistent state.

**Key boundary (AD-1):** The backend completes analysis synchronously before it responds. The frontend timer is purely presentational — it animates against data that already exists in SQLite.

---

### 3.2 Contract Queue UI (React)

Responsible for listing all uploaded contracts and reflecting their current processing status.

**Owns:** Fetching the contract list from the backend; rendering file name, upload timestamp, and status per row; navigating to the Report UI for completed contracts.

**Does not own:** Computing or storing status — all state comes from the backend; sorting, filtering, or searching the queue (out of scope, A-7).

---

### 3.3 Report UI (React)

Responsible for displaying the risk report and capturing reviewer decisions.

**Owns:** Rendering overall risk level, static summary, and the six findings ranked by severity; applying visual distinction to High-severity findings; providing status and comment controls per finding; maintaining the live review counter; persisting each change to the backend immediately.

**Does not own:** Calculating or changing the overall risk level — it is always `High` (AD-6); batching changes — each status or comment update is a separate PATCH; any durable state beyond what is loaded from the backend.

---

### 3.4 API Server (Node.js)

The single authoritative backend. Orchestrates uploads, triggers analysis, and handles all reads and writes to SQLite and the File Store.

**Owns:** Server-side file validation (authoritative gate); writing files to the File Store; inserting and updating all SQLite records; calling the Analysis Engine; returning correct error responses; logging all server-side events to stdout.

**Does not own:** Authentication or access control (out of scope); document parsing; client-side timer logic.

---

### 3.5 Analysis Engine (in-process Node.js module)

A pure, stateless module called synchronously by the API Server on every upload.

**Owns:** Applying all six hardcoded mock rules to produce a fixed report: `overall_risk = High`, a static summary sentence, and six finding records in severity order (R-01, R-02, R-03, R-04, R-05, R-06).

**Does not own:** Reading or inspecting file contents; varying output by contract; any I/O or external calls. The rules are constants and are not configurable at runtime.

---

### 3.6 File Store (local folder)

A passive storage location managed entirely by the API Server.

**Owns:** Holding uploaded files on disk. Files are written once and never modified or deleted in the MVP.

**Note:** The folder path is configurable via environment variable (`FILE_STORE_PATH`; default `./data/uploads`) to support different local environments (H-6).

---

### 3.7 Database (SQLite)

A single file co-located with the application. The sole source of persistent truth.

**Owns:** Persisting contract records, report records, and finding records. All writes originate from the API Server; the frontend never accesses SQLite directly.

---

## 4. Interfaces and Integrations

All communication between the browser and the backend is HTTP over localhost. There are no external services, no third-party APIs, and no cloud integrations in the MVP.

### 4.1 Browser → API Server

| Operation | Method | Purpose |
|-----------|--------|---------|
| Upload a contract | `POST /contracts` | Multipart upload; triggers file storage and analysis |
| List all contracts | `GET /contracts` | Populates the contract queue |
| Load a report | `GET /contracts/:id/report` | Returns report record and its six findings ordered by severity |
| Update a finding | `PATCH /findings/:id` | Updates `review_status` and/or `comment` for one finding |

The frontend treats PATCH responses optimistically: local state updates immediately, and reverts to the last confirmed server state if the request fails (design §2.4.2).

### 4.2 API Server → Analysis Engine

An internal in-process function call. The API Server passes the contract identifier; the Analysis Engine returns the fixed report object and six finding records. No data leaves the Node.js process (AD-3, design §1.5).

### 4.3 API Server → File Store

A file-system write. The uploaded file bytes are written once to a path derived from a UUID plus the original file extension to prevent collisions. The original filename is preserved in SQLite for display (architecture §4.6).

### 4.4 API Server → SQLite

Direct database operations from the backend only. The report record and all six finding records are written in the same database transaction as the contract status update to `Complete`, ensuring a contract in `Complete` status always has exactly one report and exactly six findings (design §2.1.2).

---

## 5. Data Model Summary

Three entity types are persisted in SQLite. All writes are performed by the API Server; the frontend never accesses the database directly.

### Contract

Represents one uploaded file and its processing state.

| Attribute | Mutability | Notes |
|-----------|------------|-------|
| `id` | Immutable | System-assigned unique identifier |
| `original_filename` | Immutable | Preserved for display |
| `stored_filename` | Immutable | UUID-prefixed; used on disk |
| `upload_timestamp` | Immutable | Set at INSERT |
| `status` | Mutable (once) | `Pending` on INSERT → `Complete` after findings are written |

`Processing` is a frontend-only display state; it is never written to the database (AD-1, design §2.2.1).

### Report

Represents the output of one simulated analysis, linked 1:1 to a contract.

| Attribute | Mutability | Notes |
|-----------|------------|-------|
| `id` | Immutable | System-assigned |
| `contract_id` | Immutable | FK to Contract |
| `overall_risk` | Immutable | Always `High`; never recalculated (AD-6, A-2) |
| `summary` | Immutable | Fixed static text; set at creation |

### Finding

Represents one triggered mock rule result within a report. There are always exactly six per report.

| Attribute | Mutability | Notes |
|-----------|------------|-------|
| `id` | Immutable | System-assigned |
| `report_id` | Immutable | FK to Report |
| `rule_id` | Immutable | One of `R-01` through `R-06` |
| `clause_type` | Immutable | From rule definition |
| `severity` | Immutable | `High`, `Medium`, or `Low`; from rule |
| `explanation` | Immutable | 1–2 sentence text; from rule |
| `section_reference` | Immutable | Simulated contract section label; from rule |
| `review_status` | Mutable | Default `Unreviewed`; user-settable to `Accepted`, `Overridden`, or `Reviewed` at any time |
| `comment` | Mutable | Nullable free-text; can be set, edited, or cleared |

**Review counter formula:** count of findings where `review_status ≠ Unreviewed` (design §2.2.2, FR-4).

---

## 6. Key Decisions and Rationale

| Decision | Rationale | Traceability |
|----------|-----------|-------------|
| **AD-1 — Synchronous backend analysis; frontend-driven status animation.** The backend completes analysis before responding. The `Pending → Processing → Complete` animation is driven by a client-side timer (~2–3 s) after the success response. | Spec A-4 explicitly states no backend polling is required. Async queuing would add complexity with no benefit at demo scope. | FR-2, NFR-1, NFR-2, A-4 |
| **AD-2 — Single SQLite file for all persistence.** No secondary cache or additional data store. | Single-user, local-only, demo-scale volume. SQLite is sufficient, zero-configuration, and keeps deployment trivially simple. | FR-2, NFR-4, A-5, A-6 |
| **AD-3 — Analysis Engine is an in-process module, not a service.** Called as a function from the API Server. | Six static rules require no I/O. Separating into a process would add operational overhead with no scaling or isolation benefit at this scope. | A-1, FR-3 |
| **AD-4 — File Store is a local folder.** No cloud object storage. | Spec A-6 and MVP constraints explicitly exclude cloud storage. | FR-1, A-6 |
| **AD-5 — No authentication or authorisation.** | Spec §3 explicitly excludes auth and RBAC. Tool is scoped for local demo use by a single user. | feature-spec §3, A-5 |
| **AD-6 — Overall risk is static (`High`), not derived.** It does not change when findings are overridden. | Spec FR-3 and A-2 define this as deliberate MVP behaviour. | FR-3, A-2 |
| **`Processing` not persisted.** The database holds only `Pending` and `Complete`. | The animation is presentational only; backend analysis completes before the response is sent. Persisting a transient UI state would serve no purpose. | A-4, AD-1 |
| **Report and findings written in one transaction.** Contract status is set to `Complete` in the same operation. | Ensures a `Complete` contract always has exactly one report and six findings — no partial states observable by the frontend. | FR-3, architecture §5.1 |
| **Dual-layer validation (client + server).** Both layers check file type and size. | Client-side check prevents unnecessary network requests; server-side is the authoritative gate. A file is never persisted unless server-side validation passes. | FR-1, NFR-3, NFR-5, architecture §6.3 |
| **Optimistic update on finding PATCH; revert on failure.** Local state updates immediately; reverts to last confirmed server state if the request fails. | Satisfies NFR-2 (status visible within 1 second) without requiring a full re-fetch on every user action. | FR-4, NFR-2, AC-09 |

---

## 7. Risks and Assumptions

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R-1 | SQLite write failure leaves contract in `Pending` with no report. | Low | Medium | The API Server must treat a failed transaction as an aborted upload: no queue entry, generic error shown (design §2.4.2). Clarify rollback behaviour explicitly in implementation. |
| R-2 | File Store write succeeds but subsequent SQLite INSERT fails, leaving an orphaned file on disk. | Low | Low | At MVP scope this is acceptable — orphaned files do not affect the user-visible state. Document as a known limitation. |
| R-3 | Client-side timer fires before the backend completes analysis in a slower environment. | Low | Low | The backend completes analysis synchronously before it responds (AD-1). The timer starts only after the success response is received. No race condition exists under the defined flow. |
| R-4 | Optimistic PATCH update shown to the user but then silently reverted due to a transient server error. | Low | Medium | The revert must update the review counter and reset the UI control to the last confirmed state. Requires careful handling of the revert path in the Report UI (design §2.4.2). |
| R-5 | Queue grows beyond the expected demo size (≤ 20 contracts), causing layout or scroll issues. | Low | Low | Open question H-3 is unresolved. Default scroll handling should be added; confirm expected queue size with Product Owner before implementation. |

### Assumptions

These assumptions are carried forward from the spec and architecture. Each must be confirmed before implementation begins where marked.

| # | Assumption | Confirmed? | Owner |
|---|------------|------------|-------|
| A-1 | All 6 mock rules fire on every uploaded contract — no real clause detection. | Yes | feature-spec A-1 |
| A-2 | Overall risk is fixed as `High` for all MVP contracts; not recalculated on finding overrides. | Yes | feature-spec A-2, AD-6 |
| A-3 | Finding status transitions are unrestricted; any status may be set at any time. | Yes | feature-spec A-3 |
| A-4 | The processing simulation uses a client-side timer (~2–3 s); no backend polling required. | Yes | feature-spec A-4, AD-1 |
| A-5 | Single-user only; no concurrent access or multi-tenancy handling needed. | Yes | feature-spec A-5 |
| A-6 | File storage is local; no cloud object storage. | Yes | feature-spec A-6, AD-4 |
| A-7 | The contract queue is a flat reverse-chronological list; no filtering or sorting. | Yes | feature-spec A-7 |
| H-1 | Status animation timer: `Processing` lasts ~2–3 s; `Complete` appears before the 5 s ceiling. | **Pending** | `[Product Owner]` |
| H-2 | A visible spinner or animation during `Processing` state is required. | **Pending** | `[Product Owner]` |
| H-3 | Maximum queue size for a demo session is ≤ 20 contracts. | **Pending** | `[Product Owner]` |
| H-4 | Queue re-fetches from the backend on navigation back from the Report UI (not cached state). | **Pending** | `[Tech Lead]` |
| H-5 | Comment saves require an explicit "Save" action; no auto-save on blur. | **Pending** | `[Product Owner]` |
| H-6 | File Store folder path is configurable via `FILE_STORE_PATH` env var; default `./data/uploads`. | **Pending** | `[Tech Lead]` |

---

*Last updated: 2025-07 · Version: 1.0 · Owner: `[Tech Lead]`*
