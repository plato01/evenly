/**
 * Readable on-chain payloads.
 *
 * Instead of anchoring an opaque hash, we anchor a small JSON blob that a block
 * explorer can decode to human-readable text. Minimal fields only — no member
 * info — so we expose expense basics without leaking who's involved.
 *
 * The result is 0x-prefixed hex calldata: the explorer's "UTF-8" view shows the
 * original JSON.
 */

import type { Expense, Group } from '../types';

/** UTF-8 encode a string to a byte array (Hermes-safe, no TextEncoder needed). */
function utf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // surrogate pair → full code point
      const c2 = str.charCodeAt(++i);
      const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return bytes;
}

/** JSON object → 0x-prefixed hex calldata. */
function toCalldata(obj: Record<string, unknown>): `0x${string}` {
  const json = JSON.stringify(obj);
  const hex = utf8Bytes(json)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex}`;
}

/** Readable minimal payload for an expense anchor. */
export function expenseAnchorData(e: Expense): `0x${string}` {
  return toCalldata({
    app: 'Evenly',
    type: 'expense',
    desc: e.description,
    amount: e.totalAmount,
    currency: e.currency,
    date: e.date,
  });
}

/** Initials of a name, max 2 chars, uppercase. "John Doe" → "JD", "Alice" → "A". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.map((w) => w[0]!.toUpperCase()).join('').slice(0, 2);
}

/**
 * Readable minimal payload for a group anchor. The group NAME is intentionally
 * omitted for privacy — only membership (as INITIALS) and date are recorded, so
 * the chain shows a group of this composition existed without exposing what it
 * was called or who exactly is in it.
 */
export function groupAnchorData(g: Group, memberInitials?: string[]): `0x${string}` {
  return toCalldata({
    app: 'Evenly',
    type: 'group',
    ...(memberInitials && memberInitials.length ? { members: memberInitials } : {}),
    date: g.createdAt,
  });
}
