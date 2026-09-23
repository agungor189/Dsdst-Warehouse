# DSDST Warehouse rules

Warehouse is a PWA and same-origin BFF for warehouse workflows. It is not an inventory database or business-rule authority. Read the binding V2 architecture in the checked-out `dsdst-operations/docs/architecture/` directory before changing behavior.

## Boundary

- P's Inventory/Warehouse modules own receipts, lots, containers, locations, reservations, counts, picks, packs, dispatch and the inventory ledger.
- W owns interaction flow, scanning ergonomics, installable-PWA behavior and safe proxying.
- W has no local business database and must never write P's database directly.
- Browser-visible data is a projection with explicit live/stale state. Service workers may cache the shell, not authenticated API data or business writes.
- Offline stock, receipt, count, pick, dispatch, price, approval and print mutations fail closed. Do not queue them for background replay without a new accepted ADR.

## Requests and authorization

- Keep the Panel token in Secure/HttpOnly/SameSite cookies; never expose service keys or bearer tokens to browser JavaScript.
- The BFF supplies its scoped service identity and forwards the validated human session. A service key never substitutes for a user.
- Preserve operation/idempotency keys across retries. Same-key payload mismatch must surface as conflict.
- Backend authorization in P is mandatory; UI visibility is not permission.
- Do not log secrets, full tokens, connector credentials, or unnecessary customer/order data.

## Workflow semantics

- Planned or scanned receipt is not stock until P accepts the physical event.
- Placement, movement, pick and pack are internal state/location changes, not automatic global stock OUT.
- Dispatch uses the owner-approved physical boundary; until it is decided, do not invent one.
- Count records expected, observed, difference, reason and approval. Never clamp or silently overwrite.
- Cancellation/refund and physical return remain separate.
- Labels are print intents referencing immutable L template versions; renderer/spool success is not physical confirmation.

Changes require a failing regression first, W tests plus affected P/O contract tests, and no test weakening. Do not add a local source of truth, broad refactor, migration, production access, deploy or restart unless explicitly authorized.
