# Feature Specification — Contract Risk Assessment Tool

**Version:** 1.0
**Epic:** [contract-risk-assessment-epic.md](../../epics/contract-risk-assessment-epic.md)
**Status:** Final — ready for architecture review

---

## 1. Goal and Expected Outcome

Provide sales and legal desk users with a fast, consistent first-pass risk assessment on customer contracts. The tool accepts a PDF or DOCX upload, simulates clause-level analysis against a fixed set of mock risk rules, and returns a structured report with ranked findings. Users can record review decisions and comments against each finding.

**Expected outcome:** A user can upload a contract, receive a risk report within a few seconds, and record their review decisions — all within a single browser session without specialist legal tooling.

---

## 2. Target Users and Scenarios

### Persona
**Sales / Legal Desk User** — non-technical; reviews contracts prior to deal progression. Needs quick visibility into high-risk clauses without reading the full document.

### Key Scenarios

| # | Scenario |
|---|----------|
| S1 | User uploads a new contract and waits for the risk report to appear |
| S2 | User returns to the queue to open a previously processed contract's report |
| S3 | User works through a report, marking findings and adding comments |
| S4 | User identifies a high-risk finding and routes it for immediate attention |

---

## 3. Scope

### In Scope (MVP)
- Upload contracts in **PDF** or **DOCX** format only
- Display a contract queue with per-contract processing status
- Simulate risk analysis against a fixed set of **6 predefined mock rules** (see §4, FR-1)
- Generate a structured risk report per contract
- Allow users to mark findings and add comments
- Persist uploads and report data across page refreshes
- Run locally or deploy to a simple cloud environment for demo purposes

### Out of Scope (MVP)
- Real document parsing, OCR, or NLP — analysis is fully simulated
- Authentication, user accounts, or role-based access control
- Multiple concurrent users or multi-tenancy
- Filtering, sorting, or searching the contract queue
- Exporting or sharing reports
- Email or notification workflows
- Compliance, encryption, or PII handling
- Editing or deleting uploaded contracts

---

## 4. Functional Requirements

### FR-1 — Contract Upload

The system must accept a single file upload of type PDF or DOCX (maximum 10 MB). After upload, the file must be stored and the contract must appear in the queue immediately with status **Pending**. Files of any other type or exceeding 10 MB must be rejected with a user-visible error message; the queue must remain unchanged.

---

### FR-2 — Contract Queue

The queue must display all uploaded contracts in reverse-chronological order (most recent first). Each queue row must show:
- Contract file name
- Upload timestamp
- Current processing status: **Pending**, **Processing**, or **Complete**

Status must transition from **Pending → Processing → Complete** automatically without requiring the user to reload the page. The transition to **Processing** begins immediately after upload; **Complete** is reached within 5 seconds of upload.

---

### FR-3 — Risk Report

Each completed contract must have an associated risk report accessible from the queue. The report must contain:
1. **Overall risk level** — fixed as `High` for all MVP contracts (all six mock rules fire on every upload, including two High-severity rules; the level does not recalculate when findings are overridden)
2. **Summary** — one or two sentences describing the contract's risk posture (static, simulated text)
3. **Findings list** — all triggered rule findings ranked by severity (High → Medium → Low)

**Mock risk rules (all fire on every contract):**

| Rule ID | Clause Type | Severity | Simulated Section Reference |
|---------|-------------|----------|-----------------------------|
| R-01 | Unlimited liability | High | Section 4.2 — Liability |
| R-02 | Indemnification (broad) | High | Section 5.1 — Indemnification |
| R-03 | Auto-renewal without notice | Medium | Section 9.3 — Term & Renewal |
| R-04 | Unilateral amendment right | Medium | Section 12.1 — Amendments |
| R-05 | IP ownership ambiguity | Medium | Section 7.4 — Intellectual Property |
| R-06 | Non-standard payment terms (>60 days) | Low | Section 3.2 — Payment |

Each finding must display:
- Severity label (`High`, `Medium`, `Low`)
- Short explanation of the risk (1–2 sentences)
- Simulated contract section reference (from the table above)
- Current review status (default: `Unreviewed`)

High-severity findings must be visually distinct from Medium and Low findings (e.g., via a colored badge, border, or icon).

---

### FR-4 — Finding Review Actions

For each finding in a report, the user must be able to:
- Set its status to one of: `Accepted`, `Overridden`, or `Reviewed`
- Change the status at any time (transitions are not write-once)
- Add a free-text comment
- Edit or clear a previously saved comment

The report must show a running count in the format **"X of 6 findings reviewed"** that updates immediately when statuses change. A finding counts toward the total when its status is `Accepted`, `Overridden`, or `Reviewed` (i.e., any status other than `Unreviewed`).

---

## 5. Non-Functional Requirements

| # | Requirement | Measurable Threshold |
|---|-------------|----------------------|
| NFR-1 | Report generation time | Status reaches **Complete** within **5 seconds** of upload (simulated delay) |
| NFR-2 | Status update without reload | Queue status transitions are visible within **1 second** of the transition occurring, with no user-initiated page reload |
| NFR-3 | Upload file size | Files up to **10 MB** must be accepted without error |
| NFR-4 | Data persistence | Uploaded contracts, reports, finding statuses, and comments must survive a full browser page refresh |
| NFR-5 | Supported formats | Only PDF and DOCX are accepted; other file types must be rejected with a user-visible error message |
| NFR-6 | Browser compatibility | Must function correctly in the latest stable version of Chrome |

---

## 6. Acceptance Criteria

### AC-01 — Upload accepted (FR-1)

**Given** the user is on the main page  
**When** they upload a valid PDF or DOCX file (≤ 10 MB)  
**Then** the file is saved, the contract appears at the top of the queue, and its status is **Pending**

---

### AC-02 — Invalid file rejected (FR-1, NFR-5)

**Given** the user attempts to upload a file that is not PDF or DOCX (e.g., `.txt`, `.png`)  
**When** they submit the upload  
**Then** the file is not saved, a user-visible error message is displayed, and the queue is unchanged

---

### AC-03a — Status transitions in correct sequence (FR-2)

**Given** a contract has just been uploaded
**When** the user remains on the page without reloading
**Then** the queue row status changes from **Pending** to **Processing** to **Complete** automatically, in that order, with no user action required

---

### AC-03b — Complete status reached within time threshold (FR-2, NFR-1)

**Given** a contract has just been uploaded
**When** the user observes the queue
**Then** the status reaches **Complete** within 5 seconds of the upload completing

---

### AC-04 — Queue persists across refresh (NFR-4)

**Given** one or more contracts are in the queue  
**When** the user refreshes the browser  
**Then** all previously uploaded contracts remain in the queue with their last-known status and data intact

---

### AC-05 — Report opens from queue (FR-3)

**Given** a contract's status is **Complete**  
**When** the user clicks on it in the queue  
**Then** the risk report opens, displaying the overall risk level, a summary, and the full ranked findings list

---

### AC-06 — High-risk findings are visually distinct (FR-3)

**Given** a report contains at least one High-severity finding  
**When** the user views the findings list  
**Then** High-severity findings are visually distinguishable from Medium and Low findings without requiring any action

---

### AC-07 — Finding status can be set and changed (FR-4)

**Given** a finding is displayed in a report  
**When** the user sets its status to `Accepted`, `Overridden`, or `Reviewed`  
**Then** the status is saved and displayed on the finding; the user can change it again at any time

---

### AC-08 — Comment can be added and edited (FR-4)

**Given** a finding is displayed in a report  
**When** the user enters a comment and saves it  
**Then** the comment is displayed on the finding and persists after a page refresh; the user can edit or clear it

---

### AC-09 — Review progress counter updates (FR-4)

**Given** a report is open with 6 findings all in **Unreviewed** status
**When** the user marks 2 findings as `Reviewed`
**Then** the report shows "2 of 6 findings reviewed" without requiring a page reload

---

### AC-10 — Oversized file rejected (FR-1, NFR-3)

**Given** the user attempts to upload a valid PDF or DOCX file that exceeds 10 MB
**When** they submit the upload
**Then** the file is not saved, a user-visible error message is displayed, and the queue is unchanged

---

## 7. Assumptions and Open Questions

### Assumptions

| # | Assumption |
|---|------------|
| A-1 | All 6 mock rules fire on every uploaded contract — no real clause detection |
| A-2 | The overall risk level is fixed as `High` for all MVP contracts; it does not recalculate when findings are marked `Overridden` |
| A-3 | Finding status transitions are unrestricted — users may change a finding's status at any time |
| A-4 | The processing simulation uses a deliberate frontend delay (~2–3 s); no backend polling is required |
| A-5 | Single-user, single-session only; no concurrent access handling needed |
| A-6 | File storage is local to the application (no cloud object storage) |
| A-7 | The contract queue is a flat list in reverse-chronological order; no filtering or sorting in v1 |

### Open Questions

| # | Question | Owner |
|---|----------|-------|
| OQ-1 | Is a visible "Processing…" animation or spinner desirable to reinforce the simulated async behavior? | `[Product Owner]` |
| OQ-2 | What is the maximum number of contracts expected in the queue during a demo session? (Affects display and scroll behavior.) | `[Product Owner]` |

---

*Last updated: 2025-07 · Version: 1.0 · Owner: `[Product Owner]`*
