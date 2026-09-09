# Business workspace

## Navigation
- `/plan`: user's businesses, latest update first. Empty state starts a chat; sample documents are separate.
- `/plan/workspace?planId=...`: summary, documents, one optional next action, and continuing the same chat.
- `/plan/chat?planId=...`: existing chat, with a link back to business management.
- Document links carry a plan ID. Missing IDs do not silently open a different business.

## State and safety
- List status distinguishes chat, prepared business design, partial documents, completed documents, and outdated documents.
- Only expected document sections with actual content are counted. Internal review metadata is excluded.
- A generation request alone does not prove a workflow is running. Workspace checks the existing chat endpoint for workflow status.
- Next-action completion is stored using the existing owner-scoped plan state API, tied to the design revision and action text. Completing or skipping a task never unlocks or generates documents.
- Follow-up actions prefill a chat message; they do not send it or spend AI tokens automatically.
- Existing document generation, payment checks, manual edit protection, and previous-section restoration remain in place. This change does not add an unlimited document-version archive.
- Existing non-chat plans retain their original editor path. No external service integrations or production deployment are added.

## Verification
- `node --import tsx scripts/business-hub.test.ts`: state tests plus isolated UI fixtures at 320, 390, and 1440px. Covers empty and populated lists, scoped navigation, rename/delete, action persistence, skipping, follow-up drafts, and document links.
- `node --import tsx scripts/business-coach-ui.test.ts`: chat regressions at six viewport sizes.
- `npx tsc --noEmit --incremental false`.
- UI tests use mock API responses; live AI generation and production persistence require separate deployment verification.
