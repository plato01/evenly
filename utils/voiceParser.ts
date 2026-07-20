/**
 * Offline voice/natural-language expense parser.
 *
 * Extracts amount, description, category, date offset, group hint, and friend
 * hint from spoken text using regex patterns. No network calls required.
 *
 * This is the offline fallback; an AI-powered parser can be layered on top.
 */

import { CATEGORY_KEYWORDS } from './ocrParser';

// ─── Result interface ────────────────────────────────────────────────────────

export interface VoiceParseResult {
  amount: number | null;
  description: string;
  category: string; // matches ExpenseCategory keys from constants/categories.ts
  dateOffset: number; // 0 = today, -1 = yesterday, etc.
  groupHint: string; // if user mentions a group name
  friendHint: string; // if user mentions "with [name]"
  confidence: 'high' | 'medium' | 'low';
  rawText: string;
}

// ─── Amount extraction ───────────────────────────────────────────────────────

/**
 * Words that typically precede or follow an amount in spoken language.
 * Used to boost confidence when an amount is found near these words.
 */
const AMOUNT_SIGNAL_WORDS = [
  'spent', 'paid', 'cost', 'costs', 'costing',
  'for', 'of', 'about', 'around', 'approximately',
  'worth', 'total', 'was', 'is', 'bill',
];

/**
 * Currency symbols and words that can prefix/suffix an amount.
 * The amount regex strips these to get the raw number.
 */
const CURRENCY_PREFIX = /[₹$€£¥]/;
const CURRENCY_SUFFIX = /\s*(rupees?|dollars?|bucks?|rs\.?|inr|usd|eur)/i;

/**
 * Extract the most likely expense amount from text.
 *
 * Priority:
 *  1. Number adjacent to a signal word ("spent 500", "paid 1200")
 *  2. Number with a currency symbol/word ("₹500", "500 rupees")
 *  3. First standalone number in the text
 */
function extractAmount(text: string): number | null {
  const lower = text.toLowerCase();

  // Find all number tokens in the text (with their positions)
  const numberPattern = /(?:[₹$€£¥]\s*)?(\d{1,7}(?:[.,]\d{1,2})?)(?:\s*(?:rupees?|dollars?|bucks?|rs\.?|inr|usd|eur))?/gi;
  const candidates: { value: number; index: number; hasSignal: boolean }[] = [];

  let match: RegExpExecArray | null;
  numberPattern.lastIndex = 0;
  while ((match = numberPattern.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, '');
    const num = parseFloat(raw);
    if (isNaN(num) || num <= 0 || num > 10_000_000) continue;

    // Check if a signal word is nearby (within ~20 chars before or after)
    const start = Math.max(0, match.index - 25);
    const end = Math.min(lower.length, match.index + match[0].length + 25);
    const context = lower.slice(start, end);
    const hasSignal = AMOUNT_SIGNAL_WORDS.some((w) => context.includes(w));

    // Check for currency marker
    const hasCurrency =
      CURRENCY_PREFIX.test(match[0]) || CURRENCY_SUFFIX.test(match[0]);

    candidates.push({
      value: num,
      index: match.index,
      hasSignal: hasSignal || hasCurrency,
    });
  }

  if (candidates.length === 0) return null;

  // Prefer signal-adjacent numbers; among equals, take the first
  const signaled = candidates.filter((c) => c.hasSignal);
  if (signaled.length > 0) return signaled[0].value;
  return candidates[0].value;
}

// ─── Date offset extraction ──────────────────────────────────────────────────

/**
 * Map of spoken date references to numeric day offsets (negative = past).
 */
const DATE_PATTERNS: { pattern: RegExp; offset: number }[] = [
  { pattern: /\bday before yesterday\b/i, offset: -2 },
  { pattern: /\byesterday\b/i, offset: -1 },
  { pattern: /\btoday\b/i, offset: 0 },
  { pattern: /\blast week\b/i, offset: -7 },
  { pattern: /\blast month\b/i, offset: -30 },
  // "N days ago" — dynamic
  { pattern: /\b(\d{1,2})\s+days?\s+ago\b/i, offset: NaN }, // handled specially
];

function extractDateOffset(text: string): number {
  for (const { pattern, offset } of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;

    // Dynamic "N days ago"
    if (isNaN(offset) && m[1]) {
      return -parseInt(m[1], 10);
    }
    return offset;
  }
  return 0; // default: today
}

// ─── Group hint extraction ───────────────────────────────────────────────────

/**
 * Look for patterns like:
 *  - "in Roommates group"
 *  - "in the Roommates group"
 *  - "group Roommates"
 *  - "from Trip group"
 */
function extractGroupHint(text: string): string {
  // "in [name] group"
  const inGroup = text.match(/\bin\s+(?:the\s+)?(.+?)\s+group\b/i);
  if (inGroup) return inGroup[1].trim();

  // "group [name]"
  const groupName = text.match(/\bgroup\s+([A-Z][A-Za-z0-9 ]+)/);
  if (groupName) return groupName[1].trim();

  // "from [name] group"
  const fromGroup = text.match(/\bfrom\s+(?:the\s+)?(.+?)\s+group\b/i);
  if (fromGroup) return fromGroup[1].trim();

  return '';
}

// ─── Friend hint extraction ──────────────────────────────────────────────────

/**
 * Look for patterns like:
 *  - "with Alex"
 *  - "split with Alex"
 *  - "shared with Alex"
 *  - "with Alex and Bob" (takes first name only for simplicity)
 */
function extractFriendHint(text: string): string {
  // "with [Name]" — capture one capitalized word (the friend's name)
  const withName = text.match(/\bwith\s+([A-Z][a-z]+)\b/);
  if (withName) return withName[1];
  return '';
}

// ─── Category detection ──────────────────────────────────────────────────────

/**
 * Guess the expense category by scanning the text against CATEGORY_KEYWORDS
 * (shared with ocrParser). Returns the key with the most keyword hits, or
 * "other" if nothing matches.
 */
function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  let bestCategory = 'other';
  let bestScore = 0;

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  return bestCategory;
}

// ─── Description extraction ──────────────────────────────────────────────────

/**
 * Words/phrases to strip when building the description — these are structural
 * keywords, not meaningful content.
 */
const NOISE_WORDS = [
  'i', 'spent', 'paid', 'pay', 'bought', 'got',
  'split', 'shared', 'owe', 'owed',
  'for', 'on', 'about', 'around', 'approximately',
  'yesterday', 'today', 'last week', 'last month',
  'days ago', 'day before yesterday',
  'rupees', 'dollars', 'bucks', 'rs', 'inr', 'usd', 'eur',
];

/**
 * Build a clean description from the input text by removing:
 *  - The amount (number + currency)
 *  - Structural / noise keywords
 *  - Group hint phrase
 *  - Friend hint phrase ("with Name")
 *  - Extra whitespace
 */
function extractDescription(
  text: string,
  amount: number | null,
  groupHint: string,
  friendHint: string,
): string {
  let desc = text;

  // Remove amount with optional currency prefix/suffix
  if (amount !== null) {
    // Remove all representations of the amount (e.g. "₹500", "500 rupees", "500")
    const amountStr = String(amount);
    const amountEscaped = amountStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const amountRegex = new RegExp(
      `[₹$€£¥]?\\s*${amountEscaped}(?:\\.0{1,2})?\\s*(?:rupees?|dollars?|bucks?|rs\\.?|inr|usd|eur)?`,
      'gi',
    );
    desc = desc.replace(amountRegex, ' ');
  }

  // Remove group hint phrase
  if (groupHint) {
    const groupRegex = new RegExp(
      `\\b(?:in|from)\\s+(?:the\\s+)?${escapeRegex(groupHint)}\\s+group\\b`,
      'gi',
    );
    desc = desc.replace(groupRegex, ' ');
    desc = desc.replace(new RegExp(`\\bgroup\\s+${escapeRegex(groupHint)}\\b`, 'gi'), ' ');
  }

  // Remove friend hint phrase ("with Name")
  if (friendHint) {
    desc = desc.replace(
      new RegExp(`\\bwith\\s+${escapeRegex(friendHint)}\\b`, 'gi'),
      ' ',
    );
  }

  // Remove date phrases
  desc = desc.replace(/\bday before yesterday\b/gi, ' ');
  desc = desc.replace(/\b\d{1,2}\s+days?\s+ago\b/gi, ' ');
  desc = desc.replace(/\byesterday\b/gi, ' ');
  desc = desc.replace(/\btoday\b/gi, ' ');
  desc = desc.replace(/\blast week\b/gi, ' ');
  desc = desc.replace(/\blast month\b/gi, ' ');

  // Remove noise words (whole-word match, case-insensitive)
  for (const word of NOISE_WORDS) {
    desc = desc.replace(new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi'), ' ');
  }

  // Collapse whitespace and trim
  desc = desc.replace(/\s+/g, ' ').trim();

  // Capitalize first letter
  if (desc.length > 0) {
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);
  }

  return desc;
}

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse natural-language voice input into structured expense data.
 *
 * @param text - Raw transcribed text from voice input
 * @returns Parsed result with amount, description, category, etc.
 *
 * @example
 *   parseVoiceInput("I spent 500 on dinner")
 *   // → { amount: 500, description: "Dinner", category: "food", ... }
 *
 *   parseVoiceInput("Paid 1200 for Uber to airport")
 *   // → { amount: 1200, description: "Uber to airport", category: "transport", ... }
 *
 *   parseVoiceInput("Coffee 250 yesterday")
 *   // → { amount: 250, description: "Coffee", category: "food", dateOffset: -1, ... }
 */
export function parseVoiceInput(text: string): VoiceParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      amount: null,
      description: '',
      category: 'other',
      dateOffset: 0,
      groupHint: '',
      friendHint: '',
      confidence: 'low',
      rawText: text,
    };
  }

  // Extract structured pieces
  const amount = extractAmount(trimmed);
  const dateOffset = extractDateOffset(trimmed);
  const groupHint = extractGroupHint(trimmed);
  const friendHint = extractFriendHint(trimmed);
  const description = extractDescription(trimmed, amount, groupHint, friendHint);
  const category = detectCategory(trimmed);

  // Determine confidence
  const hasAmount = amount !== null;
  const hasDescription = description.length > 0;
  let confidence: VoiceParseResult['confidence'];
  if (hasAmount && hasDescription) {
    confidence = 'high';
  } else if (hasAmount || hasDescription) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    amount,
    description,
    category,
    dateOffset,
    groupHint,
    friendHint,
    confidence,
    rawText: text,
  };
}
