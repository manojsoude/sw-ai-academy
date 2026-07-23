# Testing Summary — Contract Risk Assessment: File Upload Validation

**Version:** 1.0  
**Scope:** Server-side file upload validation only (`validateUpload.js`)  
**Lab tasks in scope:** TASK-05 (server-side validation), TASK-FE-02 (client-side validation spec)  
**Test file:** `backend/validateUpload.test.js`  
**Source module:** `backend/validateUpload.js`

---

## 1. Behaviour Tested

The tests exercise the pure validation logic that runs inside the `POST /contracts` handler
before any file is written to disk or any queue record is inserted. Two exported functions
are under test:

- **`resolvedMimeType(file)`** — resolves the effective MIME type from the parser-supplied
  value; falls back to the file extension when the MIME type is absent or
  `application/octet-stream`.
- **`validateUpload(file)`** — applies type and size checks in the order specified by the
  design document (§2.3.3), returning `null` on success or `{ error: "<user-facing message>" }`
  on failure.

All tests operate on plain JavaScript objects that mimic the `req.file` shape produced by
multer. No HTTP server, file system, or database is involved.

---

## 2. Acceptance Criteria Covered

| AC | Description | Test(s) |
|----|-------------|---------|
| **AC-01** | Valid PDF or DOCX (≤ 10 MB) is accepted | UTS-01, UTS-02, UTS-05, UTS-08, UTS-09, UTS-11 |
| **AC-02** | Non-PDF / non-DOCX file is rejected with a user-visible error | UTS-03, UTS-04, UTS-10 |
| **AC-10** | Oversized file (> 10 MB) is rejected with a user-visible error | UTS-06, UTS-07 |

**Not covered in this lab:** AC-03a, AC-03b, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09.
These criteria relate to queue status transitions, persistence, report rendering, and finding
review — all outside the validation-only scope of this lab.

---

## 3. Unit Test Scenarios Covered

All 11 scenarios defined in `unit-test-scenarios.md` are implemented and pass:

| Scenario | Type | Description |
|----------|------|-------------|
| UTS-01 | Positive | Valid PDF (1 MB) is accepted |
| UTS-02 | Positive | Valid DOCX (1 MB) is accepted |
| UTS-03 | Negative | Plain text file (`text/plain`) is rejected |
| UTS-04 | Negative | PNG image (`image/png`) is rejected |
| UTS-05 | Boundary | PDF at exactly 10 MB (10 485 760 bytes) is accepted |
| UTS-06 | Boundary | PDF at 10 MB + 1 byte is rejected |
| UTS-07 | Negative | DOCX at 15 MB is rejected |
| UTS-08 | Positive | `application/octet-stream` + `.pdf` extension accepted via fallback |
| UTS-09 | Positive | `application/octet-stream` + `.docx` extension accepted via fallback |
| UTS-10 | Negative | `application/octet-stream` + unsupported extension (`.xls`) is rejected |
| UTS-11 | Boundary | Zero-byte PDF is accepted (no minimum size defined) |

Two additional contract-shape assertions were included beyond the 11 defined scenarios:

- Error path returns an object with a string `error` property — not a thrown exception.
- Success path returns exactly `null` — not a falsy string or empty object.

**Total: 18 tests across 2 suites, all passing.**

---

## 4. Code Coverage

Test runner: Node.js built-in test runner (`node --test --experimental-test-coverage`).  
Command run: `node --test --experimental-test-coverage validateUpload.test.js`

```
------------------------------------------------------------------
file              | line % | branch % | funcs % | uncovered lines
------------------------------------------------------------------
validateUpload.js | 100.00 |    92.86 |  100.00 |
------------------------------------------------------------------
all files         | 100.00 |    92.86 |  100.00 |
------------------------------------------------------------------

tests 18 · suites 2 · pass 18 · fail 0 · cancelled 0 · skipped 0 · todo 0
duration_ms 80.53
```

**Notes on the 7.14 % branch gap:**  
The uncovered branch is the `file.mimetype || 'unknown'` fallback in `resolvedMimeType` for
the case where `file.mimetype` is an empty string or `undefined`. This edge case cannot occur
through multer in normal operation (multer always sets `mimetype` on the file object) and is
not defined as a required test scenario in `unit-test-scenarios.md`. The gap is known and
acceptable for this lab.

---

## 5. What Is Intentionally Not Covered in This Lab

| Area | Reason for exclusion |
|------|----------------------|
| Client-side validation (`validateUpload` equivalent in the React component — TASK-FE-02) | No frontend test framework is configured in this lab; the client-side logic was not extracted into a separately testable module. |
| Upload-to-queue integration (TASK-04, TASK-06, TASK-07, TASK-08) | Requires a running Express server, multer, disk I/O, and a SQLite database — integration scope, not covered here. |
| HTTP handler behaviour (`uploadHandler.js`) | Not isolated as a pure function; requires a full request/response lifecycle. |
| SQLite persistence and queue state | Functional behaviour verified only by manual or integration testing, outside this lab's scope. |
| Status transitions (`Pending → Processing → Complete`) | Involves timers and frontend state; not addressed in this lab. |
| Report generation, finding review, comments, and review counter | Feature areas FR-2 to FR-4 are entirely out of scope for this lab. |
| Real document parsing | Explicitly out of scope for the MVP; analysis is fully simulated. |
| Authentication, multi-user, or persistence across deploys | Excluded from MVP scope in the feature spec. |

No integration tests or end-to-end tests were created or run in this lab.

---

## 6. Recommendations for Next Testing Steps

1. **Extract and test client-side validation (TASK-FE-02).**  
   Move the file-type and size check in the React upload component into a standalone function
   (mirroring the `validateUpload.js` pattern on the backend). Add a matching Vitest or Jest
   test file covering the same 11 UTS scenarios. This closes the client-side gap and verifies
   dual-layer validation parity.

2. **Add a test for the `mimetype` absent / `undefined` edge case.**  
   This is the only uncovered branch in `validateUpload.js`. A single test with
   `{ mimetype: '', originalname: 'doc.pdf', size: 1024 }` would close the branch gap to
   100 %.

3. **Add integration tests for the `POST /contracts` route.**  
   Use `supertest` against the Express app to verify that the handler correctly wires
   validation → file write → SQLite insert → `201` response, and that validation failures
   return `400` with no side effects. This is the next meaningful layer after unit tests.

4. **Cover the `GET /contracts` endpoint.**  
   An integration test confirming the queue response shape (array of `{ id, original_filename,
   upload_timestamp, status }`) would validate AC-04 (persistence across refresh) and FR-2
   (queue display).

5. **Consider a component test for the Upload UI (TASK-FE-01, TASK-FE-02).**  
   A React Testing Library test that simulates file selection and asserts on the error message
   text and the disabled state of the submit button would cover AC-02 and AC-10 at the UI
   layer, complementing the logic-only unit tests.

---

*Last updated: 2025-07 · Version: 1.0 · Scope: File upload validation only*
