# ADR-010: Frontend Validation Architecture

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md), [ADR-009](ADR-009-isomorphic-typescript-bun-local-first.md)

---

## Context

SatERP is an isomorphic TypeScript application (ADR-009) where validation correctness is a compliance concern — an ITAR-controlled item with invalid classification data could cause regulatory violations. The system needs a validation strategy that:

1. Provides instant field-level feedback in the browser (UX)
2. Enforces the same rules on the server (security)
3. Works offline against local SQLite (local-first per ADR-009)
4. Distinguishes structural validation (can run anywhere) from state-dependent validation (server-only)

## Decision

### Single Schema Source of Truth

All entity validation schemas live in `@saterp/shared` as Zod schemas. These are the canonical definition of "structurally valid" for every entity:

```
@saterp/shared/src/schemas/
  quote.ts          → CreateQuoteSchema, UpdateQuoteSchema
  sales-order.ts    → CreateSalesOrderSchema
  journal-entry.ts  → CreateJournalEntrySchema
  vendor.ts         → CreateVendorSchema
  ...
```

The same schema is imported by three consumers:
- **Pothos resolvers** (server) — validates GraphQL mutation inputs
- **React Hook Form** (browser) — validates form fields via `@hookform/resolvers/zod`
- **SQLite write layer** (offline) — validates before local persistence

### Two Validation Layers

**Layer 1: Structural validation (isomorphic, runs everywhere)**

Zod schemas validate data shape, types, formats, and business rules that depend only on the input data:
- Required fields present
- Money amounts match NUMERIC(19,6) format (max 13 integer digits, max 6 decimal places per ADR-003)
- Currency codes are valid ISO 4217
- Country codes are valid ISO 3166-1 alpha-2
- Dates are valid and in expected ranges (e.g., quote valid-through date must be today or future)
- At least one line item on quotes/orders
- Debit/credit balance on journal entries

These run on keystroke (debounced) in the browser. They run before SQLite writes offline. They run before database writes on the server. Identical results everywhere.

**Layer 2: State-dependent validation (server-only)**

Rules that require current system state cannot run on the client (or run against potentially stale cached state):

| Rule | Why server-only |
|------|----------------|
| Denied-party screening (EXP-002) | Requires live screening lists (Tier 3 per ADR-009) |
| Credit limit enforcement (SLS-003) | Requires real-time AR balance across all entities |
| Inventory availability check | Stock levels change between cache sync intervals |
| Fiscal period status (ADR-007) | Must check authoritative FUTURE/OPEN/SOFT_CLOSED/HARD_CLOSED |
| Compliance status gates (ADR-006) | Database-level enforcement, cannot be approximated client-side |
| Export license drawdown (EXP-005) | License remaining quantity changes with every shipment |
| Duplicate detection (CRM-001) | Fuzzy matching requires full dataset |

Server-only validation runs after Layer 1 passes. Failures return structured error responses that the client can display inline.

### Error Handling Contract

Server-only validation failures return a consistent error shape:

```typescript
// @saterp/shared/src/errors.ts
interface ValidationError {
  code: "VALIDATION_ERROR";
  field?: string;          // which field failed (for inline display)
  message: string;         // human-readable, localized
  rule: string;            // machine-readable rule ID (e.g., "CREDIT_LIMIT_EXCEEDED")
  context?: Record<string, unknown>; // additional data (e.g., { limit: "50000.00", outstanding: "48000.00", orderValue: "5000.00" })
}
```

The client maps `field` to the corresponding form field for inline error display. Errors without `field` display as form-level banners.

### Offline Validation Behavior

When offline (Tier 1/2 per ADR-009):
- Layer 1 validation runs normally against Zod schemas
- Layer 2 validation is deferred — the record is saved locally with `sync_status='pending_push'`
- A warning banner displays: "This [quote/order] will be validated by the server when you reconnect. Compliance checks are pending."
- On sync, if the server rejects the record (Layer 2 failure), the sync layer surfaces the error in a resolution UI. The user can edit and resubmit or discard.

### Form Library Integration

React Hook Form with Zod resolver:
- `mode: 'onBlur'` for most forms (validate when user leaves a field)
- `mode: 'onChange'` for critical fields (money amounts, dates)
- Multi-line forms (journal entries, PO lines) use `useFieldArray` with per-row Zod validation
- Async server validation (e.g., duplicate detection) uses React Hook Form's `validate` function with debounced API calls when online, skipped when offline

## Rationale

The isomorphic approach eliminates the most common ERP bug category: client and server disagreeing on what's valid. In traditional ERPs, validation rules are maintained separately in frontend JS and backend Java/C# — they inevitably drift. With shared Zod schemas, drift is a compile error, not a runtime bug.

The two-layer split is necessary because some rules require system state that the client cannot reliably have. Rather than pretending the client can validate everything (and getting it wrong), we explicitly separate structural validation (everywhere) from state validation (server-only) and design the UX around that boundary.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| Server-only validation | Unacceptable UX — round-trip on every field change, no offline capability |
| Client-side validation with server schemas downloaded at runtime | Complex, fragile, still can't validate state-dependent rules |
| Separate client and server validation | The exact anti-pattern this architecture is designed to prevent — drift is inevitable |
| JSON Schema instead of Zod | Less expressive, no TypeScript inference, can't encode business rules like "debits must equal credits" |

## Consequences

### Positive
- Validation rules change once, propagate everywhere on next build
- TypeScript catches missing field handling at compile time
- Offline forms validate identically to online forms (Layer 1)
- Server-only failures are explicitly handled in the UX, not silent surprises

### Negative
- Every new entity/mutation requires a Zod schema in @saterp/shared before the form or resolver can be built
- Zod schemas must remain platform-independent (no `fs`, no `window`, no Bun-only APIs)
- Server-only validation failures require a resolution UX flow that doesn't exist in simpler architectures

## Affected Artifacts

- FEAT-009 (Platform): Add acceptance criteria for validation architecture
- SD-001 (Architecture): Already references React Hook Form + Zod; this ADR provides the detailed contract
- @saterp/shared package: Must contain all entity Zod schemas
