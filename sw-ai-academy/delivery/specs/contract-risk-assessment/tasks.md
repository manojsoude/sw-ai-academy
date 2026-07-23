# Build Tasks — Upload Contract → Save Locally → Create SQLite Queue Record → Return Processing Status

**Version:** 1.1
**Slice (backend):** Upload contract → save locally → create SQLite queue record → return processing status
**Slice (frontend):** Contract upload page → file selection and validation feedback → submit to POST /uploads → show job ID and processing status in the queue
**Source documents:** [plan.md](./plan.md) · [design.md](./design.md) · [architecture.md](./architecture.md) · [feature-spec.md](./feature-spec.md)
**Status:** Ready for implementation

---

## Overview

This task file covers the backend slice that handles a `POST /contracts` request from submission to the success response. The slice ends at the point where the API Server returns a success response to the frontend. Analysis Engine invocation, report writing, and status promotion to `Complete` are part of the same synchronous request but are scoped to a separate slice.

> **Slice boundary:** Tasks here cover file receipt, server-side validation, disk write, and the initial SQLite `Pending` INSERT. The Analysis Engine call, report/findings transaction, and status update to `Complete` that follow in the same request are outside this slice.

---

## Tasks

---

### TASK-01 — Bootstrap the Node.js API Server entry point

**Source reference:** plan §3.4 (API Server); architecture §3, §4.4

**Implementation notes:**
- Create the Node.js project structure for the backend (`package.json`, entry file, basic HTTP server).
- The server must listen on a configurable port (default `3000`) and log startup to stdout.
- Use a framework appropriate for a minimal REST API (e.g., Express). No additional middleware beyond what is required by downstream tasks.
- Logging to stdout should follow the log format defined in design §2.6.3: ISO 8601 timestamp, level, and message.

**Expected output:**
- A running Node.js HTTP server that responds to requests on localhost.
- Server start event logged to stdout.

**Completion criteria:**
- `node server.js` (or equivalent) starts without error.
- An unrecognised route returns a `404` response.
- Server start is logged to stdout with timestamp.

**Dependencies:** None.

---

### TASK-02 — Resolve the File Store folder path from environment

**Source reference:** plan §3.6, §7 assumption H-6; architecture §4.6; design §2.3.2

**Implementation notes:**
- On startup, read the `FILE_STORE_PATH` environment variable.
- If the variable is not set, default to `./data/uploads`.
- Ensure the folder exists at startup; create it (including any intermediate directories) if it does not.
- The resolved path must be used by the file-write logic in TASK-04. Do not hardcode the path anywhere else.

**Expected output:**
- `./data/uploads` (or the value of `FILE_STORE_PATH`) exists on disk after the server starts.
- The resolved path is available to the upload handler.

**Completion criteria:**
- Starting the server with no `FILE_STORE_PATH` env var creates `./data/uploads` if absent.
- Starting with `FILE_STORE_PATH=./custom/path` creates `./custom/path` instead.
- No error is thrown if the folder already exists.

**Dependencies:** TASK-01.

---

### TASK-03 — Initialise the SQLite database and `contracts` table

**Source reference:** plan §3.7, §5 (Contract entity); design §2.1.1; architecture §4.7

**Implementation notes:**
- On startup, open (or create) a SQLite file at a configurable path (default `./data/contracts.db`).
- Create the `contracts` table if it does not exist, with the following columns derived from the logical data model:
  - `id` — unique identifier (e.g., UUID stored as TEXT), primary key
  - `original_filename` — TEXT, not null
  - `stored_filename` — TEXT, not null
  - `upload_timestamp` — TEXT (ISO 8601), not null
  - `status` — TEXT, not null, default `'Pending'`
- The `reports` and `findings` tables are **not** part of this task.
- Schema creation must be idempotent (`CREATE TABLE IF NOT EXISTS`).

**Expected output:**
- A `contracts.db` SQLite file with the `contracts` table present after first run.
- The table schema matches the logical model in design §2.1.1.

**Completion criteria:**
- Server starts cleanly and the `contracts` table exists in the database file.
- Re-starting the server does not error because the table already exists.
- All five columns are present with the correct types and constraints.

**Dependencies:** TASK-01.

---

### TASK-04 — Register the `POST /contracts` multipart upload route

**Source reference:** plan §4.1; architecture §4.4, §5.1; design §2.3.1, §2.3.2, §2.3.3

**Implementation notes:**
- Register a `POST /contracts` route that accepts `multipart/form-data`.
- Use a multipart parsing library (e.g., `multer`) to receive the uploaded file. Set the upload size limit to `10 485 760 bytes` (10 MB) at the parser level so that oversized requests are rejected before the handler body runs.
- The handler is the entry point for validation (TASK-05), file write (TASK-06), and SQLite insert (TASK-07). Wire those steps together in order.
- The route must log the incoming request (method, path, original filename) to stdout.

**Expected output:**
- A registered route that accepts multipart POST requests to `/contracts`.
- Oversized requests are rejected by the parser before reaching the handler.

**Completion criteria:**
- `POST /contracts` with a valid small file reaches the handler body.
- A request exceeding 10 MB is rejected with a `400` or `413` response before any file write occurs.
- Incoming requests are logged to stdout.

**Dependencies:** TASK-01, TASK-02, TASK-03.

---

### TASK-05 — Implement server-side file type and size validation

**Source reference:** plan §3.4; design §2.3.1, §2.3.2, §2.3.3, §2.4.1; architecture §6.3; feature-spec FR-1, NFR-3, NFR-5

**Implementation notes:**
- Validation runs inside the `POST /contracts` handler, after the multipart parser has received the file.
- Apply checks in this order (design §2.3.3):
  1. **File type** — accept only `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Use the MIME type reported by the multipart parser; fall back to file extension (`.pdf`, `.docx`) if the MIME type is absent or `application/octet-stream`.
  2. **File size** — accept only files `≤ 10 485 760 bytes`. (The parser limit in TASK-04 is a first gate; this check catches any edge cases within the handler.)
- On any validation failure: return a `400` response with a JSON body `{ "error": "<user-facing message>" }`. Do not write to the File Store or SQLite. Log the rejection to stdout.
- On validation success: pass control to the file write step.

**Expected output:**
- Invalid file types return `400` with an error message.
- Oversized files return `400` (or `413` from the parser) with an error message.
- No file is written to disk on a validation failure.

**Completion criteria:**
- A `.txt` upload returns `400`; no file appears in the File Store folder.
- A `.png` upload returns `400`; no file appears in the File Store folder.
- A valid `.pdf` within size passes validation and proceeds to the file write step.
- A valid `.docx` within size passes validation and proceeds to the file write step.
- The original filename and rejection reason are logged to stdout on failure.

**Dependencies:** TASK-04.

---

### TASK-06 — Write the uploaded file to the local File Store

**Source reference:** plan §3.6, §4.3; design §2.4.2; architecture §4.6, §5.1; feature-spec FR-1

**Implementation notes:**
- Generate a `stored_filename` by combining a new UUID (v4) with the original file extension (e.g., `3f2a1b…-uuid.pdf`). This prevents name collisions (architecture §4.3).
- Write the file bytes to the File Store folder resolved in TASK-02 using the `stored_filename`.
- Preserve the original filename in a variable for the SQLite insert (TASK-07) — do not use the stored filename for display.
- If the file write fails, return a generic `500` response `{ "error": "Something went wrong. Please try again." }`. Do not proceed to the SQLite insert. Log the failure to stdout (design §2.4.2, §2.6.1).

**Expected output:**
- A file named `<uuid>.<ext>` exists in the File Store folder after a successful upload.
- The `original_filename` is retained in memory for the queue record.

**Completion criteria:**
- After a valid upload, exactly one file appears in the File Store folder with a UUID-prefixed name.
- The on-disk filename differs from the original filename.
- A simulated write failure (e.g., invalid folder path) returns `500` and does not insert a contract record.

**Dependencies:** TASK-02, TASK-05.

---

### TASK-07 — Insert the contract record into SQLite with status `Pending`

**Source reference:** plan §5 (Contract entity), §4.4, §6 AD-1; design §2.1.1, §2.2.1; architecture §4.7, §5.1; feature-spec FR-1, FR-2

**Implementation notes:**
- Generate a new UUID for the contract `id`.
- Insert a row into the `contracts` table with:
  - `id` — the new UUID
  - `original_filename` — the original filename from the upload
  - `stored_filename` — the UUID-prefixed filename written to disk in TASK-06
  - `upload_timestamp` — current UTC time in ISO 8601 format
  - `status` — `'Pending'`
- If the INSERT fails, return a generic `500` response. Log the failure to stdout. Do not leave a `Pending` queue entry visible (design §2.4.2): if the insert fails, the contract does not appear in the queue. Note: the file written in TASK-06 may remain on disk as an orphaned file — this is a known acceptable limitation at MVP scope (plan risk R-2).
- On success, retain the new contract `id` for the response payload.

**Expected output:**
- A row exists in the `contracts` table with `status = 'Pending'` immediately after the INSERT.
- The row contains the correct `original_filename`, `stored_filename`, and `upload_timestamp`.

**Completion criteria:**
- After a valid upload, one row is present in `contracts` with `status = 'Pending'`.
- `upload_timestamp` is a valid ISO 8601 UTC string.
- `original_filename` matches what the user submitted; `stored_filename` matches the UUID-prefixed filename on disk.
- A simulated INSERT failure returns `500` and no queue row is committed.

**Dependencies:** TASK-03, TASK-06.

---

### TASK-08 — Return the success response from `POST /contracts`

**Source reference:** plan §4.1; design §2.2.1; architecture §5.1; feature-spec FR-1, FR-2

**Implementation notes:**
- After the SQLite INSERT in TASK-07 succeeds, return an HTTP `201 Created` response.
- The response body must be JSON and include at minimum: `{ "id": "<contract_id>", "status": "Pending" }`. This gives the frontend the contract identifier it needs to poll or update the queue display (architecture §4.1).
- Log the successful upload event to stdout including the contract `id` and `original_filename` (design §2.6.1).
- The response is returned **before** the Analysis Engine is called. The Analysis Engine invocation is the first step of the next backend slice and occurs immediately after this response is composed, synchronously within the same request, but that work is out of scope for this task file.

**Expected output:**
- A `201` JSON response containing the new contract `id` and `"status": "Pending"`.
- Successful upload event logged to stdout.

**Completion criteria:**
- A valid upload returns HTTP `201`.
- The response body is valid JSON with `id` (a UUID string) and `status` equal to `"Pending"`.
- The contract `id` in the response matches the row inserted in TASK-07.
- No `200` or `202` is used — the response code is `201`.

**Dependencies:** TASK-07.

---

## Task Dependency Summary

```
TASK-01 (bootstrap server)
  ├── TASK-02 (File Store path)
  └── TASK-03 (SQLite init)
        └── TASK-04 (register POST /contracts route)
                   └── TASK-05 (server-side validation)
                              └── TASK-06 (write file to File Store)
                                         └── TASK-07 (INSERT Pending record)
                                                    └── TASK-08 (return 201 response)
```

Tasks TASK-02 and TASK-03 are independent of each other and can be worked in parallel after TASK-01.

---

*Last updated: 2025-07 · Version: 1.0 · Slice: Upload → save → queue record → 201 response*

---

---

# Build Tasks — Contract Upload Page → File Selection and Validation Feedback → Submit to POST /contracts → Show Job ID and Processing Status in the Queue

**Version:** 1.0
**Slice:** Contract upload page → file selection and validation feedback → submit to `POST /contracts` → show job ID and processing status in the queue
**Source documents:** [plan.md](./plan.md) · [design.md](./design.md) · [architecture.md](./architecture.md) · [feature-spec.md](./feature-spec.md)
**Status:** Ready for implementation

---

## Overview

This task file covers the React frontend slice that handles the complete upload interaction: presenting the file picker, validating the selected file client-side, submitting to `POST /contracts`, and updating the contract queue with the returned job ID and status animation. The slice boundary begins at the Upload UI component and ends when the queue row reaches `Complete` and the animation cycle is finished.

> **Slice boundary:** Tasks here cover the Upload UI component, client-side validation, multipart submission, the queue row insertion, and the `Pending → Processing → Complete` status animation. Report rendering, finding review, and backend API implementation are outside this slice.

---

## Tasks

---

### TASK-FE-01 — Scaffold the React Upload UI component

**Source reference:** plan §3.1 (Upload UI); architecture §4.1; design §1.2 Step 1

**Implementation notes:**
- Create the Upload UI component that will own file selection, validation feedback, and form submission.
- The component must render a file picker input restricted to `.pdf` and `.docx` (via the `accept` attribute: `accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"`).
- Include a submit button to trigger the upload. The button must be disabled when no file is selected and while a submission is in flight.
- The component holds no durable state of its own — all persistent data lives in SQLite via the backend (plan §3.7, architecture §4.7).
- Do not add routing, report rendering, or queue display in this component.

**Expected output:**
- A React component that renders a file input and a submit button.
- The file input is restricted to `.pdf` and `.docx` in the browser's file picker dialog.
- The submit button is disabled until a file is selected.

**Completion criteria:**
- The component renders without errors.
- Opening the file picker shows only PDF and DOCX in the native OS file dialog.
- The submit button is disabled on initial render and enabled once a file is chosen.
- Selecting a file updates visible component state (e.g., filename displayed).

**Dependencies:** None.

---

### TASK-FE-02 — Implement client-side file type and size validation

**Source reference:** plan §3.1, §6 (Dual-layer validation); design §2.3.1, §2.3.2, §2.3.3; architecture §4.1, §6.3; feature-spec FR-1, NFR-3, NFR-5, AC-02, AC-10

**Implementation notes:**
- On file selection (or on submit), apply client-side checks in the order specified by design §2.3.3:
  1. **File type** — accept only `.pdf` / `application/pdf` or `.docx` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Check both `file.type` and `file.name` extension as a fallback.
  2. **File size** — accept only files where `file.size ≤ 10 485 760` bytes (10 MB).
- On any validation failure:
  - Display a user-visible inline error message (e.g., "Only PDF or DOCX files are accepted." or "File must be 10 MB or smaller.") without navigating away or reloading (design §2.4.1, architecture §6.5).
  - Do **not** submit the file to the backend. The queue must remain unchanged (feature-spec FR-1, AC-02, AC-10).
  - Clear the file input so the user can select a different file.
- On validation success: enable or proceed to the submission step (TASK-FE-03).
- This check is the client-side layer only; the server-side layer (TASK-05 in the backend task file) is the authoritative gate and is implemented separately.

**Expected output:**
- Selecting a `.txt` or `.png` file displays a type-rejection error and does not enable submission.
- Selecting a valid file type that exceeds 10 MB displays a size-rejection error and does not enable submission.
- Selecting a valid `.pdf` or `.docx` within 10 MB clears any error and allows submission.

**Completion criteria:**
- A `.txt` file triggers the type error; no network request is made.
- A `.png` file triggers the type error; no network request is made.
- A valid `.docx` exceeding 10 MB triggers the size error; no network request is made.
- A valid `.pdf` within 10 MB passes both checks and submission proceeds.
- The error message is visible in the UI without a page reload.
- The queue row count does not change on any validation failure.

**Dependencies:** TASK-FE-01.

---

### TASK-FE-03 — Submit the validated file to POST /contracts and handle the response

**Source reference:** plan §3.1, §4.1; design §1.3 Phase A steps 2 and 10, §2.4.2; architecture §4.1, §5.1; feature-spec FR-1, FR-2, AC-01

**Implementation notes:**
- On a valid submit action, send a `multipart/form-data` POST request to `POST /contracts` with the file attached under the field name expected by the backend (align with TASK-04 in the backend slice).
- While the request is in flight:
  - Disable the submit button and file input to prevent duplicate submissions.
  - Optionally surface a loading indicator.
- **On a `201` success response:**
  - Read the `id` (job/contract ID) and `"status": "Pending"` from the response body (design §2.2.1; backend TASK-08 returns `{ "id": "...", "status": "Pending" }`).
  - Pass the new contract record (id + filename + timestamp + `Pending` status) to the queue state so it appears immediately at the top of the queue without a full page reload (feature-spec FR-2, AC-01).
  - Start the client-side status animation timer (TASK-FE-04).
  - Reset the upload form (clear file selection, re-enable button).
- **On a `400` or `413` error response:**
  - Display the error message from the response body (`error` field) as a user-visible inline message (design §2.4.1).
  - Do not add a row to the queue.
  - Re-enable the form so the user can retry.
- **On any other error (network failure, `500`):**
  - Display the generic error message "Something went wrong. Please try again." (design §2.4.2).
  - Do not add a row to the queue.
  - Re-enable the form.

**Expected output:**
- A successful upload results in a new `Pending` queue row at the top of the queue immediately, containing the contract's filename and the job ID returned from the server.
- A `400` response surfaces the server's error message inline; the queue is unchanged.
- A network or `500` error surfaces a generic message; the queue is unchanged.

**Completion criteria:**
- Submitting a valid file triggers exactly one `POST /contracts` request.
- A `201` response causes a new row to appear at the top of the queue with the returned `id` and `Pending` status.
- The file input and submit button are disabled during the in-flight request.
- A `400` response displays the server's error message; the queue row count does not increase.
- A `500` or network error displays the generic error message; the queue row count does not increase.
- The form is re-enabled after either success or failure.

**Dependencies:** TASK-FE-01, TASK-FE-02.

---

### TASK-FE-04 — Drive the Pending → Processing → Complete status animation in the queue row

**Source reference:** plan §3.1, §6 (AD-1), §7 (H-1, H-2); design §1.3 Phase A step 10, §2.2.1; architecture §4.1, §5.1, §6.2, AD-1; feature-spec FR-2, NFR-1, NFR-2, AC-03a, AC-03b

**Implementation notes:**
- After TASK-FE-03 receives a `201` success response and inserts the `Pending` queue row, start a client-side timer sequence to animate the status of that specific row. The animation is **purely presentational** — the backend has already completed analysis and written `Complete` to SQLite before the response was sent (AD-1).
- Timer sequence (design §1.3 Phase A step 10, plan H-1):
  - `t = 0`: row status is `Pending` (set immediately on queue insert in TASK-FE-03).
  - `t ≈ 1 s`: transition row status to `Processing`.
  - `t ≈ 2–3 s`: transition row status to `Complete`.
- The `Complete` transition must occur within 5 seconds of the upload completing (feature-spec NFR-1, AC-03b).
- During the `Processing` state, render a visible spinner or animation on the queue row (plan H-2, architecture H-2). The exact visual treatment is deferred to the implementer, but something observable must be present.
- Status transitions must be visible without any user-initiated page reload (feature-spec NFR-2, AC-03a).
- The timer is keyed to the specific contract row by `id`. Multiple concurrent uploads (not an MVP scenario per A-5) do not need to be handled, but the timer must not inadvertently affect other queue rows.
- `Processing` is **never** written to the database; it is a display-only state (design §2.2.1, plan §5).

**Expected output:**
- After a successful upload, the queue row automatically transitions from `Pending` → `Processing` → `Complete` without any user action.
- A spinner or equivalent visual indicator is present during the `Processing` state.
- `Complete` is reached within 5 seconds of the upload completing.

**Completion criteria:**
- The queue row status reads `Pending` immediately after the `201` response.
- The queue row status transitions to `Processing` approximately 1 second later without a page reload.
- The queue row status transitions to `Complete` within 5 seconds of the upload completing.
- A visual indicator (spinner or equivalent) is visible on the row during `Processing`.
- No page reload is required for any of the three status transitions.
- Other existing queue rows are unaffected by the timer.

**Dependencies:** TASK-FE-03.

---

### TASK-FE-05 — Render the Contract Queue UI with per-row status display

**Source reference:** plan §3.2 (Contract Queue UI); design §1.2 Step 1 and Step 2, §2.2.1; architecture §4.2; feature-spec FR-2, NFR-2, NFR-4, AC-01, AC-03a, AC-03b, AC-04

**Implementation notes:**
- Create (or complete) the Contract Queue UI component that renders all uploaded contracts as a flat list in reverse-chronological order (most recent first) (feature-spec A-7).
- On initial page load, fetch the contract list from `GET /contracts` and render each contract's: `original_filename`, `upload_timestamp`, and `status` (feature-spec FR-2, plan §4.1).
- Each row must display the contract's current status as a readable label: `Pending`, `Processing`, or `Complete`. The `Processing` label and its spinner are driven by TASK-FE-04 for the row currently animating; all other rows display the status returned from the backend.
- On page refresh, re-fetch from the backend so that all previously uploaded contracts reappear with their persisted status (feature-spec NFR-4, AC-04, architecture §5.4).
- Contracts with status `Complete` must be rendered as clickable (or navigable) to the Report UI (feature-spec AC-05). Linking/routing to the Report UI is outside this slice; the affordance (e.g., an enabled link or button) must be present on `Complete` rows.
- The queue must not change its row count in response to a failed upload (enforced upstream by TASK-FE-02 and TASK-FE-03).

**Expected output:**
- A rendered list of all contracts fetched from `GET /contracts` on page load.
- Each row shows filename, upload timestamp, and status.
- After a successful upload (TASK-FE-03), the new row appears at the top without a page reload.
- After a page refresh, all previous contracts are reloaded from the backend and displayed.

**Completion criteria:**
- On fresh page load, the queue displays all contracts returned by `GET /contracts` in reverse-chronological order.
- Each row displays `original_filename`, `upload_timestamp`, and current `status`.
- A newly uploaded contract appears at the top of the queue immediately after a `201` response, before any page reload.
- Refreshing the page reloads all contracts from the backend; no data is lost.
- Rows with `Complete` status have a visible affordance indicating they can be opened (e.g., a link, button, or cursor change). The Report UI navigation itself is out of scope for this task.
- Rows with `Pending` or `Processing` status do not show a navigation affordance to the Report UI.

**Dependencies:** TASK-FE-03, TASK-FE-04.

---

## Frontend Task Dependency Summary

```
TASK-FE-01 (scaffold Upload UI component)
  └── TASK-FE-02 (client-side validation)
             └── TASK-FE-03 (submit to POST /contracts + handle response)
                        └── TASK-FE-04 (Pending → Processing → Complete animation)
                                   └── TASK-FE-05 (Contract Queue UI rendering)
```

TASK-FE-01 has no dependencies. TASK-FE-02 through TASK-FE-05 form a sequential chain for this slice.

**Cross-slice dependency:** TASK-FE-03 depends on the backend `POST /contracts` endpoint being available and returning `{ "id": "...", "status": "Pending" }` (backend TASK-08). TASK-FE-05's initial load depends on `GET /contracts` being implemented on the backend (plan §4.1).

---

*Last updated: 2025-07 · Version: 1.0 · Slice: Upload page → validation → POST /contracts → queue status animation*
