# Advanced React Hooks — Tax workspace frontend

React 19 + TypeScript + Vite SPA that exercises advanced hooks and patterns: staged multipart uploads with progress, document entity selection, a paginated document list shared across UI surfaces, and integration points for a Spring Boot capstone API.

## Requirements

- **Node.js** 20+ (LTS recommended)
- **npm** 10+

## Setup

1. Clone the repository and open the project root (`advanced-react-hooks`).

2. Install frontend dependencies:

```bash
cd frontend && npm install
```

3. From the **repository root**, run dev / build / lint (scripts delegate to `frontend/`):

```bash
npm run dev      # Vite dev server (default http://localhost:5173)
npm run build    # TypeScript check + production bundle
npm run lint     # ESLint
npm run preview  # Preview production build locally
```

Alternatively, run the same scripts from `frontend/` after `cd frontend`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_UPLOAD_URL` | Optional. Overrides the default multipart upload URL (see [Upload](#upload)). |

Create `frontend/.env.local` if you need overrides (Vite loads `VITE_*` variables at build time).

## Backend and proxy behavior

- **Capstone Spring Boot** is expected on **`http://localhost:7070`** for proxied routes (see `frontend/vite.config.ts`): e.g. `GET /api/v1/users/{userId}/tax-overview`.
- **Local Vite middleware** stubs document APIs so the UI works without a document service in Boot:
  - `POST /api/documents` — multipart ingest (in-memory list)
  - `GET /api/documents` — full array when **no** `page` / `pageSize` query; **paged JSON** when `?page=&pageSize=` (and optional `userId=`)
  - `DELETE /api/documents/{id}` — remove one stub row
  - `POST /api/v1/documents/upload` — legacy drain-and-201 stub

Start your Spring app on port **7070** when using live tax overview data; document list/upload can still use the dev stub unless you point uploads elsewhere.

## Application specification

### Layout

- **Left panel — Documents:** drag-and-drop or browse, per-file preview (images + PDF modal), per-file and overall progress bars, required **document type** radios, batch upload, server document table with selection, pagination, bulk delete with per-row progress styling, toast on full success.
- **Right panel — Tax overview:** UUID field, load capstone tax overview; **Documents (same list as upload)** sync strip powered by the same `useDocumentList` scope as the upload panel.

### Document entity types (multipart)

Each file must have a type before upload. Values are enum-style strings for future Java alignment:

| Value | Label |
|-------|--------|
| `W2` | W-2 |
| `FORM_1099` | 1099 |
| `RECEIPT` | Receipt |
| `INVOICE` | Invoice |

Multipart field names (default): file field `file`, metadata `entityType`. Filename-based hints are applied when adding files; users must still confirm or change selection.

### Upload constraints

- **Types:** PDF, JPEG, PNG only  
- **Max size:** 10 MB per file (see `UPLOAD_MAX_BYTES` in `useFileUpload`)

### Default upload URL

If `VITE_UPLOAD_URL` is unset, uploads use **`POST /api/documents`** (multipart).

### Document list API (client)

Implemented in `frontend/src/api/documents.ts`:

- **`fetchDocumentsPage({ userId?, page?, pageSize? })`** — `GET /api/documents?...`  
  Normalizes responses shaped as a plain array, `{ documents, total, page, pageSize, hasMore, totalPages }`, or Spring **Page** (`content`, `totalElements`, `number`, `size`, `last`).

### Hooks (high level)

| Hook | Role |
|------|------|
| `useFileUpload` | Staged files, validation, FileReader previews, multipart POST per file, per-file `uploadError`, global `errors` for batch validation. |
| `useDocumentList(userId)` | Paginated list + `refresh`, `setPage`, `setPageSize`, `nextPage` / `prevPage`; **shared store per `userId`** via `useSyncExternalStore` so dashboard and upload views stay aligned. |
| `useDocumentRemoval` | Selective `DELETE` with simulated per-row progress, partial failure handling, toasts, then `refresh()` on the injected list hook. |

### Key source locations

```
frontend/
├── src/
│   ├── api/
│   │   ├── capstone.ts      # Tax overview fetch + UUID helper
│   │   └── documents.ts     # List page, delete, types
│   ├── domain/
│   │   └── documentEntities.ts
│   ├── hooks/
│   │   ├── useFileUpload.ts
│   │   ├── useDocumentList.ts
│   │   └── useDocumentRemoval.ts
│   ├── components/          # FileTransferBar, previews, removal queue, tax sync strip
│   └── App.tsx
├── vite.config.ts             # Proxy + document stubs
└── package.json
```

## Troubleshooting

- **`git push origin main`** — use the correct remote name (`origin`); typos like `orign` will fail.
- **Tax overview errors** — confirm the UUID format and that Spring is running on **7070** for proxied `GET /api/v1/users/...`.
- **Empty document list** — use **Refresh** or complete an upload; for paged `GET`, the dev stub only returns an envelope when `page` / `pageSize` are present (the app always sends them).

## License

Private / cohort repository — refer to your course or organization policy.
