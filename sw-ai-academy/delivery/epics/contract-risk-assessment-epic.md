# Contract Risk Assessment Tool — Epic

## Problem Statement

Sales and legal desk users need a way to quickly get a first-pass risk assessment on customer contracts. Manually reviewing contracts is slow, inconsistent, and creates bottlenecks before deals can progress. This epic delivers an MVP that simulates contract analysis and surfaces structured risk findings for review.

---

## Product Outcomes & Instrumentation

| Outcome | Metric | Target |
|--------|--------|--------|
| Contracts processed | Count of uploads per session | ≥1 successful upload per demo |
| Risk report completion | % of uploads that produce a report | 100% (simulated) |
| Review actions taken | Count of findings marked accepted/overridden/reviewed | ≥1 per report |

---

## Assumptions

- Document intelligence is **simulated** — no real PDF/DOCX parsing required for MVP
- No authentication or RBAC required; single-user experience only
- Tech stack: **React** (frontend), **Node.js** (backend), **SQLite** (database)
- File storage is local/application folder
- Supported formats: PDF and DOCX
- Deployment target: local or simple cloud (demo/MVP)
- Mock risk rules are predefined; no AI or external API required

---

## Non-Functional Requirements

- Uploaded files must persist across page refreshes
- Processing status must update without requiring a manual page reload
- Report generation must complete within a reasonable time for demo use
- No PII handling, encryption, or compliance requirements for MVP

---

## User Requirements

### Persona: Sales / Legal Desk User

| # | Requirement | Why |
|---|-------------|-----|
| 1 | Upload a contract in PDF or DOCX format | To initiate risk review |
| 2 | View uploaded contracts in a queue with processing status | To track submissions |
| 3 | Open a generated risk report from the queue | To review findings |
| 4 | See an overall risk level and short summary in the report | To quickly understand contract health |
| 5 | View a ranked list of findings by severity, each with explanation and simulated contract section reference | To prioritize review |
| 6 | Easily identify high-risk findings | To route for immediate attention |
| 7 | Mark findings as accepted, overridden, or reviewed | To record review decisions |
| 8 | Add comments to individual findings | To document context or rationale |

---

## Acceptance Criteria

- [ ] User can upload a PDF or DOCX file; file is saved and appears in the contract queue
- [ ] Queue shows file name, upload time, and processing status (e.g., pending → complete)
- [ ] Simulated processing generates a structured risk report with: overall risk level, summary, and ranked findings
- [ ] Each finding includes: severity, short explanation, and a reference to a simulated contract section
- [ ] High-risk findings are visually distinct (e.g., color, badge, or icon)
- [ ] User can open the report from the queue
- [ ] User can mark each finding as accepted, overridden, or reviewed
- [ ] User can add a comment to any finding
- [ ] App runs locally or deploys to a simple cloud environment for demo

---

## Open Questions & Considerations

- What mock risk rules should be predefined for the MVP demo? (e.g., indemnification clause, unlimited liability, auto-renewal)
- Should the contract queue support filtering or sorting in v1, or is a flat list sufficient?
- Is a "processing" animation/delay desirable to simulate real async behavior?
