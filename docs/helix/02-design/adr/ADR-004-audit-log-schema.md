# ADR-004: Audit Log Schema

**Authority Level:** 4 (Design)
**Status:** Accepted
**Created:** 2026-04-04
**Governed by:** [PRD](../../01-frame/prd.md)

---

## Context

SD-001 defines a `CREATE TABLE audit_log` with `chain_hash BYTEA`, `user_email` (denormalized), and `entity_type` columns. SD-002 defines `audit_entry` with `table_name`, `record_id`, `occurred_at`, and no hash column. The two schemas disagree on name, columns, and whether cryptographic chaining is used.

## Decision

The canonical audit table is **`audit_entry`** as defined in SD-002, with the following additions from SD-001:

- Add `chain_hash BYTEA` column for cryptographic chaining (tamper detection).
- Add `user_email VARCHAR(255)` as denormalized field for query convenience (the `user_id` FK is still the authoritative reference).
- Table name: `audit_entry` (not `audit_log`).
- Timestamp column: `occurred_at TIMESTAMPTZ` (not `timestamp`).
- Entity reference: `table_name VARCHAR(100)` + `record_id UUID` (not `entity_type`).
- Retain `entity_id UUID` for multi-tenant filtering.

The cryptographic chain uses SHA-256: each entry's hash includes the previous entry's hash, creating a tamper-evident chain. Chain verification is a background job, not inline.

## Rationale

SD-002 is the authoritative data model document. Its naming is more precise (`audit_entry` describes a single record; `audit_log` describes the collection). Cryptographic chaining from SD-001 adds genuine value for SOX/ITAR audit requirements and should be incorporated. Denormalized `user_email` avoids expensive joins for audit queries.

## Alternatives Considered

1. **SD-001 schema as-is** — less precise naming, missing `entity_id` tenant column.
2. **SD-002 schema without chain_hash** — loses tamper detection.
3. **Separate blockchain/merkle tree** — overkill for this use case.

## Consequences

SD-002's `audit_entry` table definition needs `chain_hash` and `user_email` columns added. SD-001's DDL example should be updated or removed to avoid confusion. Chain verification adds a background job to the platform module.

## Affected Artifacts

- SD-001 (DDL example needs update)
- SD-002 (add columns)
