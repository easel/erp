/**
 * Entity Zod schemas — single source of truth for all entity validation.
 * Imported by Pothos resolvers (server) and React Hook Form (browser).
 * See ADR-010 §Single Schema Source of Truth.
 */
export * from "./vendor.js";
export * from "./quote.js";
export * from "./journal-entry.js";
