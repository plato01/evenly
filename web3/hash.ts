/**
 * Deterministic record hashing for on-chain anchoring.
 *
 * The whole tamper-proof story rests on this: we hash an expense/group record
 * the SAME way every time, anchor that hash on-chain, and later re-hash the
 * local record and compare. Match = untampered. Differ = altered.
 *
 * Determinism rules (do not "improve" casually — it breaks verification of
 * already-anchored records):
 *  - Only the fields in the `*_ANCHOR_FIELDS` lists are hashed.
 *  - Keys are sorted alphabetically before serializing.
 *  - Numbers are normalized to fixed precision so 40 and 40.0 hash equally.
 *  - undefined/null fields are omitted, not serialized as "null".
 */

import * as Crypto from 'expo-crypto';

/**
 * Fields that define an expense's on-chain identity (match the `Expense` type,
 * camelCase). Order-independent. `splits` is included so tampering with who owes
 * what changes the hash — it's serialized deterministically below.
 */
export const EXPENSE_ANCHOR_FIELDS = [
  'id',
  'groupId',
  'description',
  'totalAmount',
  'currency',
  'paidBy',
  'createdAt',
  'splits',
] as const;

/** Fields that define a group's on-chain identity (match the `Group` type). */
export const GROUP_ANCHOR_FIELDS = [
  'id',
  'name',
  'type',
  'createdBy',
  'createdAt',
] as const;

/** Normalize a value into a stable string form for hashing. */
function normalize(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') {
    // Fixed precision so 40 === 40.0 === 40.00 hash identically.
    return Number.isInteger(value) ? value : Number(value.toFixed(6));
  }
  if (Array.isArray(value)) {
    // Sort by serialized content so element order never affects the hash
    // (e.g. splits loaded from DB in a different order still verify).
    return value
      .map(normalize)
      .filter((v) => v !== undefined)
      .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  }
  if (typeof value === 'object') {
    return canonicalize(value as Record<string, unknown>);
  }
  return value;
}

/** Produce a canonical object: sorted keys, normalized values, no undefined. */
function canonicalize(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = normalize(obj[key]);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/**
 * Canonical JSON string for a record, restricted to the given anchor fields.
 * Exposed for debugging/verification tooling.
 */
export function canonicalString(
  record: Record<string, unknown>,
  fields: readonly string[],
): string {
  const picked: Record<string, unknown> = {};
  for (const f of fields) {
    if (record[f] !== undefined && record[f] !== null) picked[f] = record[f];
  }
  return JSON.stringify(canonicalize(picked));
}

/** SHA-256 hex digest of an arbitrary string. */
export async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

/** Hash an expense record → 0x-prefixed 32-byte hex (bytes32-compatible). */
export async function hashExpense(
  expense: Record<string, unknown>,
): Promise<`0x${string}`> {
  const digest = await sha256(canonicalString(expense, EXPENSE_ANCHOR_FIELDS));
  return `0x${digest}`;
}

/** Hash a group record → 0x-prefixed 32-byte hex (bytes32-compatible). */
export async function hashGroup(
  group: Record<string, unknown>,
): Promise<`0x${string}`> {
  const digest = await sha256(canonicalString(group, GROUP_ANCHOR_FIELDS));
  return `0x${digest}`;
}

/**
 * Re-hash a local record and compare to the hash that was anchored on-chain.
 * This is the tamper check.
 */
export async function verifyExpense(
  expense: Record<string, unknown>,
  anchoredHash: string,
): Promise<boolean> {
  const current = await hashExpense(expense);
  return current.toLowerCase() === anchoredHash.toLowerCase();
}
