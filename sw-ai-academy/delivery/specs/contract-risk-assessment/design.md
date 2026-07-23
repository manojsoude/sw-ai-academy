# Design — Contract Risk Assessment Tool

**Version:** 0.2
**Source of truth:** [feature-spec.md](./feature-spec.md)
**Architecture reference:** [architecture.md](./architecture.md)
**Status:** Draft — HLD complete, LLD pending

---

## 2. Low-Level Design (LLD)

### 2.1 Data Model Overview

The system persists three entity types in SQLite. Each entity is described in terms of its attributes, their purpose, and the constraints that govern them. No physical schema is defined here — this is a logical description only.

---

#### 2.1.1 Contract

Represents one uploaded file and its current processing state.

| Attribute | Type | Description | Constraints |
|-----------|------|-------------|-------------|
| `id` | Identifier | Unique contract identifier | System-assigned; immutable after creation |
| `original_filename` | Text | File name as submitted by the user | Preserved for display; not modified |
| `stored_filename` | Text | Filename used on disk (normalised to avoid collisions) | Assigned at upload; immutable |
| `upload_timestamp` | Timestamp | Moment the upload was accepted by the server | Set on INSERT; immutable |
| `status` | Enum | Current processing state | One of: `Pending`, `Complete` (see §2.2) |

**Notes:**
- `Pending` is the initial status written at INSERT time before the Analysis Engine runs (architecture §4.4, §5.1).
- `Complete` is written immediately after findings are persisted; there is no durable `Processing` state in the database — `Processing` is a frontend-only display state (AD-1).
- Contracts are never deleted or updated in the MVP beyond the single status transition (spec §3 Out of Scope).

**Traceability:** FR-1, FR-2, NFR-4 · architecture §4.4, §4.7

---

#### 2.1.2 Report

Represents the output of one simulated analysis run, linked to a contract.

| Attribute | Type | Description | Constraints |
|-----------|------|-------------|-------------|
| `id` | Identifier | Unique report identifier | System-assigned; immutable |
| `contract_id` | Reference | Links the report to its contract | One report per contract; immutable FK |
| `overall_risk` | Enum | Fixed risk rating for the report | Always `High` in MVP (spec FR-3, A-2) |
| `summary` | Text | Static one-to-two sentence risk description | Fixed simulated text; set at creation; never updated |

**Notes:**
- A report record is created in the same database transaction as its 6 finding records (architecture §5.1, step 7).
- There is exactly one report per contract.
- `overall_risk` is stored as `High` unconditionally; the application never recalculates it (AD-6).

**Traceability:** FR-3, A-2 · architecture §4.5, §4.7, AD-6

---

#### 2.1.3 Finding

Represents one triggered mock rule result within a report.

| Attribute | Type | Description | Constraints |
|-----------|------|-------------|-------------|
| `id` | Identifier | Unique finding identifier | System-assigned; immutable |
| `report_id` | Reference | Links the finding to its report | FK to Report; immutable |
| `rule_id` | Text | Identifier of the mock rule that produced this finding | One of: `R-01` through `R-06` |
| `clause_type` | Text | Human-readable clause category | Set from rule definition; immutable |
| `severity` | Enum | Risk severity of the finding | One of: `High`, `Medium`, `Low`; set from rule; immutable |
| `explanation` | Text | One-to-two sentence risk description | Set from rule definition; immutable |
| `section_reference` | Text | Simulated contract section label | Set from rule definition; immutable |
| `review_status` | Enum | Current user review state | One of: `Unreviewed`, `Accepted`, `Overridden`, `Reviewed`; default `Unreviewed`; mutable |
| `comment` | Text (nullable) | Free-text annotation entered by the reviewer | Nullable; mutable; can be cleared (set to null) |

**Notes:**
- All 6 finding records are written at report creation time, one per mock rule (spec FR-3, A-1).
- `rule_id`, `severity`, `explanation`, `section_reference`, and `clause_type` are determined by the Analysis Engine's hardcoded rule definitions and are never changed after creation (architecture §4.5).
- Only `review_status` and `comment` are updated after creation, and only by explicit user action (spec FR-4).
- A finding counts as "reviewed" for the progress counter when `review_status` is any value other than `Unreviewed` (spec FR-4).

**Traceability:** FR-3, FR-4, A-1, A-3 · architecture §4.3, §4.5, §4.7

---

### 2.2 Status Model

Two status dimensions exist in the system: the contract processing status and the finding review status. They are independent and governed by separate rules.

---

#### 2.2.1 Contract Processing Status

This status reflects whether the backend has completed analysis for a contract.

```
INSERT
  │
  ▼
Pending ──── Analysis Engine completes ──── Complete
```

| Status | Meaning | Who sets it |
|--------|---------|-------------|
| `Pending` | Contract record created; analysis not yet complete | API Server on INSERT |
| `Complete` | Analysis complete; report and all 6 findings written | API Server after findings persist |

**Rules:**
- `Pending` is always the initial status (spec FR-1).
- The transition to `Complete` is one-way and irreversible (spec §3 Out of Scope — no editing or deletion).
- There is no database-level `Processing` state. The frontend displays `Processing` as a presentational step of the client-side animation; the database holds only `Pending` or `Complete` (AD-1).
- A contract with status `Pending` has no associated report or findings. A contract with status `Complete` always has exactly one report and exactly six findings.

**Traceability:** FR-2, A-4 · architecture §4.4, AD-1

---

#### 2.2.2 Finding Review Status

This status records the reviewer's decision on each finding.

```
         ┌───────────────────────┐
         │                       │
  Default │                       │ User action (any time)
         ▼                       │
    Unreviewed ◄──────────────────┤
         │                       │
         │  User sets status      │
         ▼                       │
    Accepted ────────────────────┤
    Overridden ──────────────────┤
    Reviewed ────────────────────┘
```

| Status | Meaning | Counts as reviewed? |
|--------|---------|---------------------|
| `Unreviewed` | No decision recorded | No |
| `Accepted` | Reviewer accepts the risk as stated | Yes |
| `Overridden` | Reviewer disagrees with or dismisses the finding | Yes |
| `Reviewed` | Reviewer has read the finding; no specific decision | Yes |

**Rules:**
- All findings start as `Unreviewed` (spec FR-3).
- Any transition between any status values is permitted at any time (spec FR-4, A-3). Status changes are not write-once.
- A finding may be returned to `Unreviewed` from any other status. This would decrement the "reviewed" counter.
- The progress counter formula is: `count of findings where review_status ≠ Unreviewed` (spec FR-4).
- `review_status` transitions do not affect `overall_risk` (spec FR-3, A-2, AD-6).

**Traceability:** FR-4, A-3 · architecture §4.3

---

### 2.3 Validation Rules

Validation is applied at two layers: client-side (Upload UI) and server-side (API Server). The server-side layer is the authoritative gate; the client-side layer exists to prevent unnecessary network requests (architecture §6.3).

---

#### 2.3.1 File Type

| Layer | Check | Pass condition | Fail behaviour |
|-------|-------|----------------|----------------|
| Client | File extension and/or MIME type | `.pdf` / `application/pdf` or `.docx` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Display error; do not submit; queue unchanged |
| Server | MIME type (or extension as fallback) | Same two types as client | Return error response; do not write to File Store or SQLite |

**Traceability:** FR-1, NFR-5, AC-02 · architecture §4.1, §4.4, §6.3

---

#### 2.3.2 File Size

| Layer | Check | Pass condition | Fail behaviour |
|-------|-------|----------------|----------------|
| Client | File size in bytes | `≤ 10 485 760 bytes` (10 MB) | Display error; do not submit; queue unchanged |
| Server | Request body size | `≤ 10 485 760 bytes` (10 MB) | Return error response; do not write to File Store or SQLite |

**Traceability:** FR-1, NFR-3, AC-10 · architecture §4.1, §4.4, §6.3

---

#### 2.3.3 Validation Order

Both checks are applied before any write occurs. File type is checked first; if that passes, file size is checked. A failure at either point stops all further processing. No partial writes are made.

---

#### 2.3.4 Finding Update Validation

When a `PATCH /findings/:id` request is received:

| Field | Rule |
|-------|------|
| `review_status` | If present, must be one of `Unreviewed`, `Accepted`, `Overridden`, `Reviewed` |
| `comment` | If present, must be a text string or an explicit null (to clear the comment) |
| Unknown fields | Ignored; they do not cause an error |
| Both fields absent | Treated as a no-op; the record is not written and the current state is returned |

**Traceability:** FR-4, A-3 · architecture §4.4

---

### 2.4 Error Handling Rules

Errors are categorised into user-visible validation errors and system errors. The two are handled differently.

---

#### 2.4.1 User-Visible Validation Errors (Upload)

These arise from invalid file submissions and are expected, recoverable states.

| Trigger | Where surfaced | Queue effect |
|---------|---------------|--------------|
| Invalid file type (client-side) | Error message in the Upload UI | No change |
| Oversized file (client-side) | Error message in the Upload UI | No change |
| Invalid file type (server-side) | Error message in the Upload UI (from response) | No change |
| Oversized file (server-side) | Error message in the Upload UI (from response) | No change |

**Rules:**
- The error message must be visible without the user scrolling or navigating away (spec AC-02, AC-10).
- The error clears when the user makes a new file selection.
- The queue must not show a `Pending` entry for a rejected upload (spec AC-02, AC-10).

**Traceability:** FR-1, NFR-5, AC-02, AC-10 · architecture §6.5

---

#### 2.4.2 System Errors

These cover all non-validation failures: disk write failure, database write failure, unexpected server errors.

| Trigger | Where surfaced | Queue effect |
|---------|---------------|--------------|
| File Store write failure | Generic error message in the Upload UI | No contract record written; queue unchanged |
| Database write failure during upload | Generic error message in the Upload UI | Any partially written records are treated as incomplete; queue unchanged |
| Unexpected server error (5xx) | Generic error message in the Upload UI | Queue unchanged |
| Finding `PATCH` failure | Generic error message in the Report UI | Local state is not updated; last known state from the server is preserved |

**Rules:**
- A generic message (e.g., "Something went wrong. Please try again.") is sufficient; detailed system errors are not exposed to the user (architecture §6.5).
- On a finding update failure, the UI reverts the optimistic local state to the last confirmed server state. The review counter reflects the reverted state.
- A failed upload never results in a `Pending` entry in the queue.

**Traceability:** FR-1, FR-4 · architecture §4.4, §4.3, §6.5

---

### 2.5 Simulated Assessment Rules

The Analysis Engine applies the following six hardcoded mock rules to every uploaded contract. The rules are constants — they do not vary by file content, file name, or file type.

| Rule ID | Clause Type | Severity | Explanation (displayed to reviewer) | Simulated Section Reference |
|---------|-------------|----------|--------------------------------------|-----------------------------|
| R-01 | Unlimited liability | High | This contract contains an unlimited liability clause. Exposure is uncapped and could result in significant financial risk to the organisation. | Section 4.2 — Liability |
| R-02 | Indemnification (broad) | High | Broad indemnification language requires the party to defend and hold harmless the counterparty for a wide range of claims, including those not directly caused by the party's own actions. | Section 5.1 — Indemnification |
| R-03 | Auto-renewal without notice | Medium | The contract renews automatically unless cancelled within a specified window. No advance notice obligation is placed on the counterparty. | Section 9.3 — Term & Renewal |
| R-04 | Unilateral amendment right | Medium | The counterparty retains the right to amend contract terms without requiring the other party's consent, potentially altering obligations after signing. | Section 12.1 — Amendments |
| R-05 | IP ownership ambiguity | Medium | Intellectual property ownership of work product created during the contract is not clearly defined, creating potential disputes over rights and usage. | Section 7.4 — Intellectual Property |
| R-06 | Non-standard payment terms (>60 days) | Low | Payment terms extend beyond 60 days, which is outside standard practice and may create cash flow risk. | Section 3.2 — Payment |

**Application rules:**
- All 6 rules fire on every upload without exception (spec FR-3, A-1).
- The order of findings in the report is always: R-01, R-02 (High); R-03, R-04, R-05 (Medium); R-06 (Low) — consistent with the severity ranking required by spec FR-3.
- The static summary text produced alongside these findings is: *"This contract presents a high risk profile. Two critical clauses — unlimited liability and broad indemnification — require immediate legal review before execution."*
- No file content is read or processed. The Analysis Engine output is identical for every uploaded file (spec A-1, architecture §4.5).
- The mock rules are not user-configurable and cannot be modified at runtime.

**Traceability:** FR-3, A-1, A-2 · architecture §4.5, AD-3, AD-6

---

### 2.6 Logging Rules

The application is a local, single-user tool. Logging serves developer diagnostics and traceability, not production observability.

---

#### 2.6.1 What Is Logged

| Event | Level | Log content |
|-------|-------|-------------|
| Server starts | INFO | Port and environment |
| Upload request received | INFO | Filename (original), file size, MIME type |
| Client-side validation failure | — | Not logged on the server (occurs in the browser) |
| Server-side validation failure | WARN | Filename, file size, MIME type, reason for rejection |
| File written to File Store | INFO | Stored filename, byte size |
| Contract record inserted | INFO | Contract `id`, upload timestamp |
| Analysis Engine invoked | INFO | Contract `id` |
| Analysis Engine completed | INFO | Contract `id`, number of findings produced (always 6) |
| Report and findings inserted | INFO | Contract `id`, report `id` |
| Contract status updated to Complete | INFO | Contract `id` |
| Upload response sent | INFO | Contract `id`, HTTP status code |
| Finding `PATCH` received | INFO | Finding `id`, fields being updated |
| Finding `PATCH` applied | INFO | Finding `id`, new `review_status` (if updated) |
| Any unhandled server error | ERROR | Request path, error message, stack trace |

---

#### 2.6.2 What Is Not Logged

- Comment text (free-text user input is not written to logs)
- File contents (no parsing occurs; nothing to log)
- Browser-side actions beyond what is described above

---

#### 2.6.3 Log Format and Destination

- Logs are written to `stdout` only. No log files, no external log sink.
- Format: structured lines with timestamp, level, and a message. JSON format is acceptable but not required.
- Log level is configurable (e.g., via an environment variable `LOG_LEVEL`). Default is `INFO`.

**Traceability:** architecture §4.4, §4.5 (developer-facing diagnostics for the local-first MVP; no production observability requirement in spec)

---

### 2.7 Traceability Summary

This section maps every LLD decision to the originating spec requirement or architecture decision.

| LLD Section | Decision | Feature Spec | Architecture |
|-------------|----------|--------------|--------------|
| §2.1.1 Contract | Two statuses only (`Pending`, `Complete`); no `Processing` in DB | FR-1, FR-2 | AD-1, §4.4 |
| §2.1.1 Contract | Contracts never deleted or modified beyond status transition | §3 Out of Scope | §4.6 |
| §2.1.2 Report | `overall_risk` always `High`; never recalculated | FR-3, A-2 | AD-6, §4.5 |
| §2.1.2 Report | One report per contract; created with findings in one operation | FR-3 | §4.5, §5.1 |
| §2.1.3 Finding | All 6 finding attributes except `review_status` and `comment` are immutable | FR-3, A-1 | §4.5 |
| §2.1.3 Finding | `review_status` default is `Unreviewed` | FR-3 | §4.5 |
| §2.1.3 Finding | `comment` is nullable and clearable | FR-4 | §4.3 |
| §2.2.1 Contract status | `Processing` is frontend-only; not persisted | A-4 | AD-1, §6.2 |
| §2.2.1 Contract status | `Pending → Complete` is one-way | §3 Out of Scope | §4.4 |
| §2.2.2 Finding status | All transitions unrestricted; no write-once constraint | FR-4, A-3 | §4.3 |
| §2.2.2 Finding status | Counter counts any non-`Unreviewed` status | FR-4 | §4.3 |
| §2.3.1 File type | PDF and DOCX only; checked at both layers | FR-1, NFR-5 | §6.3 |
| §2.3.2 File size | 10 MB ceiling; checked at both layers | FR-1, NFR-3 | §6.3 |
| §2.3.4 Finding update | Invalid `review_status` value rejected | FR-4 | §4.4 |
| §2.4.1 Upload errors | Error shown in UI; queue unchanged on rejection | FR-1, AC-02, AC-10 | §6.5 |
| §2.4.2 System errors | Generic message shown; no partial queue entries | FR-1, FR-4 | §4.4, §6.5 |
| §2.4.2 Finding error | Optimistic update reverted on failure | FR-4 | §4.3 |
| §2.5 Mock rules | All 6 rules fire unconditionally; content not read | FR-3, A-1 | §4.5, AD-3 |
| §2.5 Mock rules | Static summary text defined here | FR-3 | §4.5 |
| §2.5 Finding order | High → Medium → Low (R-01, R-02, R-03, R-04, R-05, R-06) | FR-3 | §4.3 |
| §2.6 Logging | Logs to `stdout` only; no file or external sink | — (local MVP) | §4.4, §4.5 |
| §2.6 Logging | Comment text not logged | FR-4 (user data) | §4.3 |

---

## 1. High-Level Design (HLD)

### 1.1 Overview

The Contract Risk Assessment Tool is a single-user, local-first application. A user uploads a contract in the browser, the backend stores the file and immediately runs a simulated analysis, then the frontend plays a short status animation and presents a fully formed risk report. The user can then open the report and record review decisions against each finding.

All components run on one machine. There are no external services, no authentication, and no real document parsing in the MVP.

---

### 1.2 Main User Flow

The following steps describe the complete journey from a user's perspective, covering all four key scenarios from the spec.

```
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 1 — Upload                                                      │
│  User selects a PDF or DOCX file (≤ 10 MB) and submits it.           │
│  → Invalid file: error message shown, queue unchanged (AC-02, AC-10) │
│  → Valid file: contract appears at top of queue as "Pending" (AC-01) │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 2 — Status animation (no user action required)                  │
│  Queue row transitions: Pending → Processing → Complete              │
│  Completes within 5 seconds of upload (AC-03a, AC-03b)               │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 3 — Open report                                                 │
│  User clicks the completed contract row.                              │
│  Report opens showing: overall risk (High), summary, 6 findings      │
│  ranked by severity (High → Medium → Low) (AC-05, AC-06)             │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STEP 4 — Review findings                                             │
│  User sets a status (Accepted / Overridden / Reviewed) per finding.  │
│  User adds, edits, or clears a free-text comment per finding.        │
│  Progress counter "X of 6 findings reviewed" updates live (AC-09)    │
│  All changes persist across a page refresh (AC-07, AC-08, AC-04)     │
└──────────────────────────────────────────────────────────────────────┘
```

**Spec traceability:** S1 → Steps 1–2 · S2 → Steps 1, 3 · S3 → Step 4 · S4 → Step 4 (High-severity filter)

---

### 1.3 Main System Flow

The following shows what happens inside the system for each phase of the user flow.

#### Phase A — Upload and analysis

```
Browser (Upload UI)
│
│  1. Client-side validation: file type + size (FR-1, NFR-3, NFR-5)
│     ├── Fail → display error, abort (AC-02, AC-10)
│     └── Pass → continue
│
│  2. POST /contracts  [multipart file]
│
▼
Node.js API Server
│
│  3. Server-side validation: file type + size (authoritative gate)
│     ├── Fail → return error response (AC-02, AC-10)
│     └── Pass → continue
│
│  4. Write file → Local File Store  (one write, never modified, FR-1, A-6)
│
│  5. INSERT contract record into SQLite  (status = Pending, FR-2)
│
│  6. Call Analysis Engine (synchronous, in-process, AD-1, AD-3)
│     └── Analysis Engine applies all 6 mock rules (A-1, FR-3)
│         Returns: overall risk = High, static summary, 6 finding records
│
│  7. INSERT report + 6 findings into SQLite  (findings status = Unreviewed)
│
│  8. UPDATE contract status → Complete in SQLite
│
│  9. Return success response  →  Browser
│
▼
Browser (Upload UI / Contract Queue UI)
│
│  10. Start client-side timer (~2–3 s)  (A-4, AD-1)
│      ├── t=0 s:  queue row displays Pending
│      ├── t~1 s:  queue row transitions to Processing
│      └── t~2–3 s: queue row transitions to Complete  (NFR-1, NFR-2)
```

> The backend has already completed analysis and written all data **before** the success response is sent. The frontend timer is purely presentational — it plays the `Pending → Processing → Complete` animation against data that already exists in SQLite. (AD-1)

---

#### Phase B — Report viewing

```
Browser (Contract Queue UI)
│
│  1. User clicks a Complete contract row
│
▼
Browser (Report UI)
│
│  2. GET /contracts/:id/report
│
▼
Node.js API Server
│
│  3. Query SQLite: report record + 6 finding records (ordered by severity)
│  4. Return report object with ranked findings
│
▼
Browser (Report UI)
│
│  5. Render: overall risk level, summary, findings list
│     High-severity findings rendered with visual distinction (AC-06)
│     Review counter initialised from loaded finding statuses (FR-4)
```

---

#### Phase C — Finding review

```
Browser (Report UI)
│
│  1. User sets finding status OR saves a comment
│
│  2. PATCH /findings/:id  [status and/or comment]
│
▼
Node.js API Server
│
│  3. UPDATE finding record in SQLite
│  4. Return updated finding
│
▼
Browser (Report UI)
│
│  5. Update local state immediately (optimistic, no reload)
│  6. Review counter recalculates from local state  (AC-09, NFR-2)
```

---

### 1.4 Component Interactions

The diagram below shows how the five runtime components communicate and what each one owns.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                              │
│                                                                       │
│  ┌─────────────┐    ┌──────────────────────┐    ┌─────────────────┐ │
│  │  Upload UI  │    │  Contract Queue UI   │    │   Report UI     │ │
│  │             │    │                      │    │                 │ │
│  │ File pick   │    │ List contracts       │    │ Show report     │ │
│  │ Validation  │    │ Show status          │    │ Show findings   │ │
│  │ POST file   │    │ Navigate to report   │    │ Review actions  │ │
│  └──────┬──────┘    └──────────┬───────────┘    └────────┬────────┘ │
│         │                      │                          │          │
└─────────┼──────────────────────┼──────────────────────────┼──────────┘
          │  HTTP (localhost)     │  HTTP (localhost)         │  HTTP (localhost)
          │                      │                           │
┌─────────▼──────────────────────▼───────────────────────────▼──────────┐
│  Node.js API Server                                                    │
│                                                                        │
│  ┌──────────────────────────────────────────┐                         │
│  │  Analysis Engine (in-process module)     │                         │
│  │  Applies 6 hardcoded mock rules (AD-3)   │                         │
│  │  Returns fixed report + 6 findings       │                         │
│  └──────────────────────────────────────────┘                         │
│                                                                        │
└───────────────────────┬──────────────────────────┬────────────────────┘
                        │                          │
              ┌─────────▼──────┐        ┌──────────▼────────┐
              │   SQLite DB    │        │  Local File Store │
              │                │        │                   │
              │ contracts      │        │ uploaded files    │
              │ reports        │        │ (write-once)      │
              │ findings       │        └───────────────────┘
              └────────────────┘
```

**Communication rules:**
- The three React UIs communicate with the API Server only via HTTP over localhost. They never access SQLite or the File Store directly.
- The Analysis Engine is called by the API Server as an in-process function, not over HTTP.
- The File Store and SQLite are owned exclusively by the API Server.

---

### 1.5 Data Movement Across Components

| Step | From | To | Data |
|------|------|----|------|
| Upload | Browser (Upload UI) | API Server | Multipart file (PDF/DOCX) |
| File persist | API Server | File Store | Raw file bytes; filename normalised on disk, original preserved in DB |
| Contract record | API Server | SQLite | `id`, `original_filename`, `upload_timestamp`, `status = Pending` |
| Analysis trigger | API Server | Analysis Engine | Internal function call (no data leaves the process) |
| Analysis result | Analysis Engine | API Server | Report object: `overall_risk = High`, `summary`, 6 finding objects |
| Report + findings persist | API Server | SQLite | Report record + 6 finding records (`status = Unreviewed`) |
| Status update | API Server | SQLite | `contract.status = Complete` |
| Upload response | API Server | Browser | Success acknowledgement (triggers client-side timer) |
| Queue load | API Server | Browser (Queue UI) | List of contract records (id, filename, timestamp, status) |
| Report load | API Server | Browser (Report UI) | Report record + 6 finding records ordered by severity |
| Finding update | Browser (Report UI) | API Server | `finding_id`, updated `status` and/or `comment` |
| Finding persist | API Server | SQLite | Updated finding record |
| Finding update response | API Server | Browser (Report UI) | Updated finding (used to confirm optimistic local state) |

---

### 1.6 Traceability to the Spec

| HLD Element | Feature Spec Reference | Architecture Reference |
|-------------|------------------------|------------------------|
| Client-side file validation (type + size) | FR-1, NFR-3, NFR-5, AC-02, AC-10 | §4.1, §6.3 |
| Server-side file validation (authoritative gate) | FR-1, NFR-5 | §4.4, §6.3 |
| File stored in Local File Store | FR-1, A-6 | §4.6, AD-4 |
| Contract inserted with status Pending | FR-2 | §4.4 |
| Analysis Engine applies 6 mock rules on every upload | FR-3, A-1 | §4.5, AD-3 |
| Overall risk fixed as High | FR-3, A-2 | §4.3, AD-6 |
| Static summary text per report | FR-3 | §4.5 |
| 6 findings with severity, explanation, section reference | FR-3 | §4.5 |
| Findings ranked High → Medium → Low in Report UI | FR-3 | §4.3 |
| High-severity findings visually distinct | FR-3, AC-06 | §4.3 |
| Status animation (Pending → Processing → Complete) driven by client-side timer | FR-2, NFR-1, NFR-2, A-4 | §4.1, AD-1, §6.2 |
| Backend analysis synchronous; complete before response | NFR-1, A-4 | AD-1 |
| Finding status (Accepted / Overridden / Reviewed) settable and changeable | FR-4, AC-07, A-3 | §4.3 |
| Free-text comment per finding (add, edit, clear) | FR-4, AC-08 | §4.3 |
| Review counter updates live without reload | FR-4, NFR-2, AC-09 | §4.3 |
| All data persists across page refresh | NFR-4, AC-04 | §4.7, §6.1 |
| Single SQLite file; frontend reconstructed from DB on load | NFR-4 | §4.7, AD-2 |
| No authentication or access control | §3 Out of Scope | AD-5 |

---

*Last updated: 2025-07 · Version: 0.2 · Owner: `[Tech Lead]`*
