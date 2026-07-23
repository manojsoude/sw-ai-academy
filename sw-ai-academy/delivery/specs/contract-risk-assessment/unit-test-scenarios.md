# Unit Test Scenarios — File Upload Validation

**Version:** 1.0
**Slice:** File upload validation (server-side and client-side)
**Source spec:** [feature-spec.md](./feature-spec.md) — FR-1, NFR-3, NFR-5, AC-01, AC-02, AC-10
**Build tasks confirmed in scope:** TASK-05 (server-side validation), TASK-FE-02 (client-side validation)

> **Scope note:** These scenarios cover file type and file size validation logic only. They do not include tests for upload-to-queue integration, SQLite persistence, UI rendering, report generation, finding review, authentication, or real document parsing.

---

## Scenarios

---

### UTS-01 — Valid PDF file is accepted

| Field | Value |
|---|---|
| **Scenario ID** | UTS-01 |
| **Source AC** | AC-01 (FR-1) |
| **Type** | Positive |
| **Input** | File with MIME type `application/pdf`, extension `.pdf`, size 1 MB |
| **Expected result** | Validation passes; no error is returned; control passes to the next step (file write / submission) |

---

### UTS-02 — Valid DOCX file is accepted

| Field | Value |
|---|---|
| **Scenario ID** | UTS-02 |
| **Source AC** | AC-01 (FR-1) |
| **Type** | Positive |
| **Input** | File with MIME type `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, extension `.docx`, size 1 MB |
| **Expected result** | Validation passes; no error is returned; control passes to the next step |

---

### UTS-03 — Plain text file is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-03 |
| **Source AC** | AC-02 (FR-1, NFR-5) |
| **Type** | Negative |
| **Input** | File with MIME type `text/plain`, extension `.txt`, size 1 KB |
| **Expected result** | Validation fails; a user-facing error is returned (e.g., "Only PDF or DOCX files are accepted."); no file is written; the queue is unchanged |

---

### UTS-04 — PNG image file is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-04 |
| **Source AC** | AC-02 (FR-1, NFR-5) |
| **Type** | Negative |
| **Input** | File with MIME type `image/png`, extension `.png`, size 500 KB |
| **Expected result** | Validation fails; a user-facing error is returned; no file is written; the queue is unchanged |

---

### UTS-05 — File exactly at the 10 MB size limit is accepted

| Field | Value |
|---|---|
| **Scenario ID** | UTS-05 |
| **Source AC** | AC-01 (FR-1, NFR-3) |
| **Type** | Boundary |
| **Input** | Valid `.pdf` file, size exactly 10 485 760 bytes (10 MB) |
| **Expected result** | Validation passes; no error is returned; control passes to the next step |

---

### UTS-06 — File one byte over the 10 MB limit is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-06 |
| **Source AC** | AC-10 (FR-1, NFR-3) |
| **Type** | Boundary |
| **Input** | Valid `.pdf` file, size 10 485 761 bytes (10 MB + 1 byte) |
| **Expected result** | Validation fails; a user-facing error is returned (e.g., "File must be 10 MB or smaller."); no file is written; the queue is unchanged |

---

### UTS-07 — Oversized DOCX file is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-07 |
| **Source AC** | AC-10 (FR-1, NFR-3) |
| **Type** | Negative |
| **Input** | Valid `.docx` file (correct MIME type), size 15 MB |
| **Expected result** | Validation fails; a user-facing error is returned; no file is written; the queue is unchanged |

---

### UTS-08 — MIME type absent; extension `.pdf` used as fallback and accepted

| Field | Value |
|---|---|
| **Scenario ID** | UTS-08 |
| **Source AC** | AC-01 (FR-1); TASK-05 fallback rule |
| **Type** | Positive |
| **Input** | File with MIME type `application/octet-stream`, extension `.pdf`, size 500 KB |
| **Expected result** | Validation passes (extension fallback applies); control passes to the next step |

---

### UTS-09 — MIME type absent; extension `.docx` used as fallback and accepted

| Field | Value |
|---|---|
| **Scenario ID** | UTS-09 |
| **Source AC** | AC-01 (FR-1); TASK-05 fallback rule |
| **Type** | Positive |
| **Input** | File with MIME type `application/octet-stream`, extension `.docx`, size 500 KB |
| **Expected result** | Validation passes (extension fallback applies); control passes to the next step |

---

### UTS-10 — MIME type absent; unsupported extension is rejected

| Field | Value |
|---|---|
| **Scenario ID** | UTS-10 |
| **Source AC** | AC-02 (FR-1, NFR-5); TASK-05 fallback rule |
| **Type** | Negative |
| **Input** | File with MIME type `application/octet-stream`, extension `.xls`, size 500 KB |
| **Expected result** | Validation fails (MIME type absent and extension not `.pdf` or `.docx`); a user-facing error is returned; no file is written |

---

### UTS-11 — Zero-byte PDF is accepted (size is within limit)

| Field | Value |
|---|---|
| **Scenario ID** | UTS-11 |
| **Source AC** | AC-01 (FR-1, NFR-3) |
| **Type** | Boundary |
| **Input** | File with MIME type `application/pdf`, extension `.pdf`, size 0 bytes |
| **Expected result** | Validation passes (0 bytes ≤ 10 MB); no size or type error is returned; the spec defines no minimum file size |

---

## Traceability Matrix

| Scenario | AC | FR / NFR | Build Task |
|---|---|---|---|
| UTS-01 | AC-01 | FR-1 | TASK-05, TASK-FE-02 |
| UTS-02 | AC-01 | FR-1 | TASK-05, TASK-FE-02 |
| UTS-03 | AC-02 | FR-1, NFR-5 | TASK-05, TASK-FE-02 |
| UTS-04 | AC-02 | FR-1, NFR-5 | TASK-05, TASK-FE-02 |
| UTS-05 | AC-01 | FR-1, NFR-3 | TASK-05, TASK-FE-02 |
| UTS-06 | AC-10 | FR-1, NFR-3 | TASK-05, TASK-FE-02 |
| UTS-07 | AC-10 | FR-1, NFR-3 | TASK-05, TASK-FE-02 |
| UTS-08 | AC-01 | FR-1 | TASK-05 |
| UTS-09 | AC-01 | FR-1 | TASK-05 |
| UTS-10 | AC-02 | FR-1, NFR-5 | TASK-05 |
| UTS-11 | AC-01 | FR-1, NFR-3 | TASK-05, TASK-FE-02 |

---

*Last updated: 2025-07 · Version: 1.0 · Owner: `[Engineer]`*
