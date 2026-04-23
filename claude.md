# Collaboration log — AI vs manual contribution

This document summarizes how work on this repository was split between **human direction** (requirements, constraints, acceptance criteria, integration choices) and **AI-assisted implementation** (drafting, wiring, and iterating on code). Percentages are **indicative**, based on effort type rather than line-count audits; they intentionally weight **your specification and review stake higher** than raw token generation.

---

## Bifurcation (indicative)

| Category | Approx. share | Notes |
|----------|----------------|-------|
| **Manual — product & constraints** | **38%** | What to build, what not to touch (e.g. capstone backend read-only), UX expectations, “build on top of existing” rules. |
| **Manual — review & steering** | **27%** | Approving direction, follow-up refinements, git workflow, environment checks, course deliverable alignment. |
| **AI-assisted — implementation** | **28%** | Hook/component/API/stub code produced in-editor from those specs; multiple passes per feature. |
| **AI-assisted — docs & scaffolding** | **7%** | README, this file, comments where needed; template glue. |

**Rounded headline split (for reporting)**  

- **Human-led (specification + steering + review): ~65%**  
- **AI-assisted (implementation + doc drafting): ~35%**

The headline split treats **deciding what “done” means** and **owning integration risk** as manual work, even when AI wrote most of the keystrokes.

---

## Types of prompts used (categories only)

Prompts were iterative and stacked on prior state. **Categories** (paraphrased; no verbatim logs):

1. **Scoped feature builds** — Add UI/behavior on top of existing flows without breaking them (e.g. entity type controls, required fields, filename hints).
2. **Backend alignment, read-only** — Match naming/shape to another repo; **no edits** to that backend; frontend-only alignment.
3. **API contract & UX** — Multipart upload endpoint, success toast, list refresh, clear queue; per-file errors on failure; sequential partial success.
4. **Parity requests** — Delete/remove flows with **same progress-bar patterns** as upload; skip failed items; aggregate success/error messaging.
5. **Shared state / hooks** — Central list hook with `userId`, `refresh()`, pagination; usable from more than one surface so the app “stays in sync.”
6. **Repository hygiene** — Project README: setup, env, proxy/stub behavior, specifications tables.
7. **Process / tooling** — Run lint/build in workspace; fix linter issues (e.g. effects + `setState`) without changing product intent.

This file was requested as **meta-documentation** of that collaboration; **the prompt that asked for this file is intentionally omitted** from the list above.

---

## Enhancements and cross-cutting items requested

| Theme | What was asked (summary) | Cross-cutting aspect |
|--------|---------------------------|----------------------|
| **Document taxonomy** | Dropdown/radio + required entity; infer from filename; align values with future Java enums. | Domain module + upload hook + preview card + validation path. |
| **Upload pipeline** | `POST /api/documents`, multipart; toast; refresh list; clear staging; inline errors per file. | `useFileUpload`, `App`, API module, Vite stub. |
| **Removal pipeline** | Selectable server list; bulk/single delete UX; progress like upload; continue on error; toasts. | `useDocumentRemoval`, cards, stub `DELETE`, shared busy states. |
| **Document list** | `useDocumentList(userId)`; pagination; `refresh()`; shared between “dashboard” and upload surfaces. | External store + `useSyncExternalStore`, `documents` API, tax panel sync component. |
| **Dev / integration** | Stub list + paged GET; proxy capstone on 7070; optional `VITE_UPLOAD_URL`. | `vite.config.ts`, env docs in README. |

**Cross-implementation suggestions** (things implied across tasks): single source of truth for the document list; don’t duplicate upload progress patterns; keep capstone Java untouched; prefer small focused diffs; ESLint-clean effects.

---

## How to read the percentages

- **Higher manual stake** here means: requirements, tradeoffs, and “do not regress X” are treated as the dominant cost; AI output is **subordinate** to that spec and still requires your review to ship.
- If you need a **single number for coursework**: use **~65% human / ~35% AI** (headline) or the table breakdown for more granularity.
- Update this file when major new prompts land so the **categories** stay accurate; rebalance percentages only if the collaboration model actually shifts.

---

## Disclaimer

No automated tool counted lines by author. Figures reflect **collaboration style** (directed implementation) agreed for this repo’s documentation, not a forensic audit.
