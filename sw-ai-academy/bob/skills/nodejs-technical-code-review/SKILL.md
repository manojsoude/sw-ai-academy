---
name: nodejs-technical-code-review
description: Review Node.js backend code for technical quality, maintainability, security basics, error handling, logging, dependency usage, and alignment with the implementation plan. This skill does not perform functional testing.
---
# Node.js Technical Code Review

Review Node.js backend changes from a technical engineering perspective.

## Focus areas

Check the implementation for:

- Clear module structure and separation of concerns
- Alignment with the approved architecture and implementation plan
- Consistent use of existing repository conventions
- Safe async and error handling
- Appropriate HTTP status codes and error responses
- Secure file and path handling where applicable
- Safe database access patterns
- Parameterized queries or ORM-safe usage
- Minimal and justified dependency usage
- Logging that avoids sensitive data
- Readability and maintainability
- Scope control: no unnecessary architecture, infrastructure, or unrelated features

## Out of scope

Do not validate functional acceptance criteria in detail.
Do not perform end-to-end testing.
Do not verify user workflows.

Functional behavior will be validated in the testing phase.

## Output format

Return the review as:

1. Technical review summary
2. What looks technically sound
3. Issues to fix
4. Severity: Critical, Important, or Suggestion
5. Suggested fix
6. Final recommendation: Ready for human review / Needs technical fixes
