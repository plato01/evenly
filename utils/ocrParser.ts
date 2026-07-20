/**
 * Receipt OCR text parser — v3 (bug-fixed after audit).
 *
 * Fixed from audit:
 * - #3  correctDigits() no longer runs on full lines — only price zones
 * - #2  Removed all lookbehind (?<!...) regex — Hermes-safe
 * - #4  Currency regex split into pre-compiled small patterns, no mega-alternation
 * - #5  "1,234" ambiguity handled with context
 * - #6  Indian format accepts 3-digit first groups (123,45,678)
 * - #9  "Total 3 items $42.50" — skips small numbers before currency amounts
 * - #10 Multiple "total" lines — picks largest among candidates
 * - #13 Noise keywords use word boundary check, not .includes()
 */

// —— CURRENCY SUPPORT ——
// Pre-compiled individual patterns instead of one mega-alternation (#4 ReDoS fix)

const CURRENCY_SYMBOLS_SET = new Set('₹$€£¥₩₪₫₴₸₺₼₽﷼₡₣₦₧₨₯₰₱₲₳₵₶₷₾฿');

const MULTI_CHAR_CURRENCY_LIST = [
  'R$', 'kr', 'zł', 'Kč', 'Ft', 'lei', 'лв',
  'RM', 'Rp', 'Rs', 'Rs.', 'PHP', 'THB',
  'HK$', 'NT$', 'S$', 'A$', 'C$', 'NZ$', 'US$',
  'CHF', 'CLP', 'ARS', 'COP', 'MXN', 'PEN', 'BRL',
  'KRW', 'JPY', 'CNY', 'RMB', 'GBP', 'EUR', 'USD', 'INR',
  'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'EGP',
  'ZAR', 'NGN', 'KES', 'GHS', 'TZS', 'UGX', 'MAD', 'TND', 'DZD',
  '元', '円', '원',
];

/** Strip all currency symbols/codes from a string */
function stripCurrency(text: string): string {
  let s = text;
  // Strip single-char symbols
  s = s.split('').filter(ch => !CURRENCY_SYMBOLS_SET.has(ch)).join('');
  // Strip multi-char codes (case-sensitive)
  for (const code of MULTI_CHAR_CURRENCY_LIST) {
    const idx = s.indexOf(code);
    if (idx !== -1) {
      s = s.slice(0, idx) + s.slice(idx + code.length);
    }
  }
  return s;
}

// —— OCR DIGIT CORRECTION ——

const DIGIT_MAP: Record<string, string> = {
  'O': '0', 'o': '0', 'Q': '0',
  'l': '1', 'I': '1', '|': '1', '!': '1',
  'Z': '2',
  'S': '5',
  'G': '6',
  'B': '8',
};

/** More aggressive map — ONLY for price zones, never full lines */
const AGGRESSIVE_DIGIT_MAP: Record<string, string> = {
  ...DIGIT_MAP,
  'D': '0',
  'i': '1',
  'z': '2',
  'E': '3',
  'A': '4', 'h': '4',
  's': '5',
  'b': '6',
  'T': '7',
  'g': '9', 'q': '9',
};

/**
 * Correct OCR misreads ONLY in the rightmost ~15 chars (price zone).
 * NEVER on full line text — "Olive Oil $12.50" must NOT become "01ive 0i1 $12.50"
 * (#3 critical fix)
 */
function correctPriceZone(text: string): string {
  const match = text.match(/(\s+)(\S{2,15})(\s*)$/);
  if (!match) {
    if (text.length <= 15 && /\d/.test(text)) {
      return text.split('').map(ch => AGGRESSIVE_DIGIT_MAP[ch] ?? ch).join('');
    }
    return text;
  }

  const before = text.slice(0, match.index! + match[1].length);
  const priceZone = match[2];
  const after = match[3];
  const corrected = priceZone.split('').map(ch => AGGRESSIVE_DIGIT_MAP[ch] ?? ch).join('');
  return before + corrected + after;
}

// No-decimal currencies
const NO_DECIMAL_CURRENCIES = new Set([
  'JPY', 'KRW', 'VND', 'IDR', 'CLP', 'UGX', 'TZS', 'KES',
  'GHS', 'NGN', 'HUF', 'ISK', 'TWD',
  '¥', '₩', '₫', '円', '원', 'Ft', 'Rp',
]);

function isNoDecimalCurrency(context: string): boolean {
  const upper = context.toUpperCase();
  for (const c of NO_DECIMAL_CURRENCIES) {
    if (upper.includes(c.toUpperCase())) return true;
  }
  if (/[¥₩₫]/.test(context)) return true;
  if (/\bRp\.?\s*\d/.test(context)) return true;
  return false;
}

/** Clean a raw price string into a valid number */
function cleanPriceString(raw: string, lineContext?: string): number | null {
  let s = stripCurrency(raw).replace(/\s/g, '').trim();
  if (!s) return null;

  s = s.split('').map(ch => DIGIT_MAP[ch] ?? ch).join('');

  // Indian number format (#6 fix)
  const indianMatch = s.match(/^(\d{1,3}(?:,\d{2})+,\d{3})(?:\.(\d{1,2}))?$/);
  if (indianMatch) {
    s = indianMatch[1].replace(/,/g, '') + (indianMatch[2] ? '.' + indianMatch[2] : '');
    const num = parseFloat(s);
    if (!isNaN(num) && num > 0 && num < 1_000_000_000) return Math.round(num * 100) / 100;
  }

  const commaCount = (s.match(/,/g) || []).length;
  const dotCount = (s.match(/\./g) || []).length;

  if (commaCount >= 2 && dotCount === 0) {
    s = s.replace(/,/g, '');
  } else if (commaCount === 1 && dotCount === 0) {
    const parts = s.split(',');
    const afterComma = parts[1];
    if (afterComma && afterComma.length === 3) {
      s = s.replace(',', '');
    } else if (afterComma && afterComma.length === 2) {
      // Ambiguous (#5): context-aware
      if (lineContext && /[₹]|Rs\.?|INR/i.test(lineContext)) {
        s = s.replace(',', ''); // Indian: 1,00 = 100
      } else if (lineContext && /[€]|EUR/i.test(lineContext)) {
        s = s.replace(',', '.'); // European: 12,50 = 12.50
      } else {
        const beforeComma = parseInt(parts[0]);
        if (beforeComma < 100) s = s.replace(',', '.');
        else s = s.replace(',', '');
      }
    } else {
      s = s.replace(',', '');
    }
  } else if (commaCount >= 1 && dotCount >= 1) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else {
    s = s.replace(/,/g, '');
  }

  const parts = s.split('.');
  if (parts.length > 2) {
    s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
  }

  s = s.replace(/[^0-9.]/g, '');
  if (!s) return null;

  const num = parseFloat(s);
  if (isNaN(num) || num <= 0 || num >= 1_000_000_000) return null;

  if (lineContext && isNoDecimalCurrency(lineContext)) {
    return Math.round(num);
  }
  return Math.round(num * 100) / 100;
}

// —— Total keyword patterns ——

const TOTAL_KEYWORDS = [
  'grand total', 'total due', 'amount due', 'balance due',
  'total amount', 'net total', 'amount payable', 'total payable',
  'net payable', 'you pay', 'card total', 'credit total',
  'total (incl', 'total incl', 'total inc',
  'bill total', 'bill amount', 'invoice total',
  'итого', 'всего',
  'toplam', 'genel toplam',
  '合計', '合计', '总计',
  '합계', '총액',
  'jumlah',
  'รวม', 'ยอดรวม',
  'tổng cộng',
  'total', 'subtotal', 'sub total', 'sub-total',
  'amount', 'balance', 'due', 'pay', 'charge',
];

// #13 fix: word boundary matching
const IGNORE_PATTERNS = [
  /\btotal\s+items\b/i,
  /\btotal\s+qty\b/i,
  /\btotal\s+quantity\b/i,
  /\btotal\s+savings\b/i,
  /\btotal\s+discount\b/i,
  /\byou\s+saved\b/i,
  /\bitems\s+sold\b/i,
  /\btax\s+total\b/i,
  /\bpoints\b/i,
  /\breward\b/i,
  /\bcashback\b/i,
];

function isNoiseLine(line: string): boolean {
  return IGNORE_PATTERNS.some(p => p.test(line));
}

// —— Number extraction — Hermes-safe (no lookbehinds #2) ——

function extractPricesFromLine(line: string): number[] {
  const results: number[] = [];
  const seen = new Set<number>();

  const addNum = (n: number | null) => {
    if (n !== null && !seen.has(n)) { seen.add(n); results.push(n); }
  };

  // Pattern 1: Currency symbol/code + number
  for (const sym of CURRENCY_SYMBOLS_SET) {
    const idx = line.indexOf(sym);
    if (idx === -1) continue;
    const after = line.slice(idx + 1).trim();
    const numMatch = after.match(/^(\d[\d,.\s]*\d|\d+)(?:\.\d{1,2})?/);
    if (numMatch) addNum(cleanPriceString(numMatch[0], line));
  }
  for (const code of MULTI_CHAR_CURRENCY_LIST) {
    const idx = line.indexOf(code);
    if (idx === -1) continue;
    const after = line.slice(idx + code.length).trim();
    const numMatch = after.match(/^(\d[\d,.\s]*\d|\d+)(?:\.\d{1,2})?/);
    if (numMatch) addNum(cleanPriceString(numMatch[0], line));
    if (idx > 0) {
      const before = line.slice(0, idx).trim();
      const numMatch2 = before.match(/(\d[\d,.]*\d|\d+)(?:\.\d{1,2})?\s*$/);
      if (numMatch2) addNum(cleanPriceString(numMatch2[0], line));
    }
  }

  // Pattern 2: Indian format without currency symbol
  const indianMatches = line.match(/\d{1,3}(?:,\d{2})+,\d{3}(?:\.\d{1,2})?/g);
  if (indianMatches) {
    for (const m of indianMatches) addNum(cleanPriceString(m, line));
  }

  // Pattern 3: Standard decimal numbers
  const decimalMatches = line.match(/\d{1,6}\.\d{1,2}/g);
  if (decimalMatches) {
    for (const m of decimalMatches) addNum(cleanPriceString(m, line));
  }

  // Pattern 4: Western thousands
  const westernMatches = line.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?/g);
  if (westernMatches) {
    for (const m of westernMatches) addNum(cleanPriceString(m, line));
  }

  // Pattern 5: Plain integers (only if no decimal numbers found)
  if (results.length === 0) {
    const intMatches = line.match(/\d{2,9}/g);
    if (intMatches) {
      for (const m of intMatches) {
        const n = cleanPriceString(m, line);
        if (n !== null && n > 1) addNum(n);
      }
    }
  }

  return results;
}

/**
 * Extract total from context around a keyword line.
 *
 * Strategy: prefer the price on the SAME line as the keyword (most reliable).
 * Only fall back to the next 1-2 lines if the keyword line has no price.
 * When multiple prices exist on one line, pick the LAST one (rightmost on
 * receipts is typically the total, not a quantity or item count — fixes #9).
 */
function extractTotalFromContext(ocrLines: string[], idx: number): number | null {
  // First: try the keyword line itself
  const keywordLine = ocrLines[idx];
  let nums = extractPricesFromLine(keywordLine);
  if (nums.length === 0) {
    const corrected = correctPriceZone(keywordLine);
    if (corrected !== keywordLine) nums = extractPricesFromLine(corrected);
  }
  // Prefer the last (rightmost) price on the keyword line
  const pricelike = nums.filter(n => n > 0.5);
  if (pricelike.length > 0) return pricelike[pricelike.length - 1];

  // Fallback: check the next 1-2 lines (price may be on a separate line)
  for (let j = idx + 1; j < Math.min(idx + 3, ocrLines.length); j++) {
    const line = ocrLines[j];
    // Stop if we hit another keyword line (that's a different section)
    const lower = line.toLowerCase().trim();
    if (TOTAL_KEYWORDS.some(kw => lower.includes(kw))) break;

    let fallbackNums = extractPricesFromLine(line);
    if (fallbackNums.length === 0) {
      const corrected = correctPriceZone(line);
      if (corrected !== line) fallbackNums = extractPricesFromLine(corrected);
    }
    const fallbackPricelike = fallbackNums.filter(n => n > 0.5);
    if (fallbackPricelike.length > 0) return fallbackPricelike[fallbackPricelike.length - 1];
  }

  return null;
}

// —— Main parser ——

export interface OcrResult {
  amount: string;
  description: string;
  category: string;
  allAmounts: number[];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
}

export function parseReceiptText(ocrLines: string[]): OcrResult {
  const lines = ocrLines.slice(0, 200);
  const rawText = lines.join('\n');
  const lowerLines = lines.map(l => l.toLowerCase().trim());
  const allAmounts: number[] = [];

  for (const line of lines) {
    allAmounts.push(...extractPricesFromLine(line));
  }

  let amount = '';
  let confidence: OcrResult['confidence'] = 'low';

  // #10 fix: collect ALL total candidates, pick best
  const totalCandidates: { value: number; confidence: OcrResult['confidence']; keywordRank: number }[] = [];

  for (const keyword of TOTAL_KEYWORDS) {
    for (let i = lowerLines.length - 1; i >= 0; i--) {
      if (!lowerLines[i].includes(keyword)) continue;
      if (isNoiseLine(lowerLines[i])) continue;

      if (lowerLines[i].includes('change') || lowerLines[i].includes('cash')) {
        if (keyword !== 'total' && keyword !== 'grand total') continue;
      }

      const val = extractTotalFromContext(lines, i);
      if (val !== null) {
        const kwRank = TOTAL_KEYWORDS.indexOf(keyword);
        totalCandidates.push({
          value: val,
          confidence: kwRank < 8 ? 'high' : kwRank < 18 ? 'medium' : 'low',
          keywordRank: kwRank,
        });
      }
    }
  }

  if (totalCandidates.length > 0) {
    totalCandidates.sort((a, b) => {
      if (a.keywordRank !== b.keywordRank) return a.keywordRank - b.keywordRank;
      return b.value - a.value;
    });
    amount = totalCandidates[0].value.toFixed(2);
    confidence = totalCandidates[0].confidence;
  }

  if (!amount) {
    const reasonable = allAmounts.filter(n => n > 1 && n < 1_000_000_000);
    if (reasonable.length > 0) {
      amount = Math.max(...reasonable).toFixed(2);
      confidence = 'low';
    }
  }

  if (!amount) {
    for (const line of lines) {
      const corrected = correctPriceZone(line);
      const nums = extractPricesFromLine(corrected);
      allAmounts.push(...nums);
    }
    const reasonable = allAmounts.filter(n => n > 1 && n < 1_000_000_000);
    if (reasonable.length > 0) {
      amount = Math.max(...reasonable).toFixed(2);
      confidence = 'low';
    }
  }

  const description = guessDescription(lines);
  const category = guessCategory(lines, description);

  return { amount, description, category, allAmounts, rawText, confidence };
}

// —— Merchant / Description extraction ——

const SKIP_DESCRIPTION_PATTERNS = [
  /^\d{5,}/,
  /^\d{1,2}[/\-]\d{1,2}/,
  /^(tel|phone|fax|www|http|email)/i,
  /^\d+\s+(street|st|ave|rd|blvd|ln|dr|ct)/i,
  /^(gst|gstin|tin|pan|cin|fssai)/i,
  /^(tax|vat|cgst|sgst|igst)/i,
  /^\*+$/,
  /^[-=_.]{3,}$/,
  /^(invoice|receipt|bill)\s*(no|#|number)/i,
  /^(date|time|order|table|server|cashier)/i,
  /^(thank|thanks)/i,
  /^(cash|card|upi|visa|master|amex|rupay)/i,
  /^\d+[-]\d+\s*/,
  /^[A-Z0-9]{2,6}$/,
  /^(total|subtotal|sub total|change|balance)/i,
];

function guessDescription(lines: string[]): string {
  const candidates: string[] = [];

  for (let i = 0; i < Math.min(7, lines.length); i++) {
    const line = lines[i].trim();
    if (line.length < 3) continue;
    if (SKIP_DESCRIPTION_PATTERNS.some(p => p.test(line))) continue;
    if (/^\d+[\s.,]*$/.test(line)) continue;
    const digitRatio = (line.match(/\d/g) || []).length / line.length;
    if (digitRatio > 0.6) continue;
    if (line.length < 4 && /[0-9]/.test(line)) continue;

    const cleaned = line.replace(/[*#_=]/g, '').trim();
    if (cleaned.length >= 3) candidates.push(cleaned);
  }

  if (candidates.length === 0) return '';
  const best = candidates.find(c => /[a-zA-Z]{2,}/.test(c) && c.length >= 4) ?? candidates[0];
  return best.length > 50 ? best.slice(0, 50) : best;
}

// —— Category auto-detection ——

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: [
    'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'sushi', 'diner',
    'bistro', 'grill', 'kitchen', 'eatery', 'dhaba', 'biryani', 'chai',
    'bakery', 'donut', 'ice cream', 'dessert', 'bar', 'pub', 'brew',
    'starbucks', 'mcdonald', 'subway', 'domino', 'kfc', 'zomato', 'swiggy',
    'uber eats', 'dunkin', 'taco', 'noodle', 'ramen', 'wok',
  ],
  groceries: [
    'grocery', 'supermarket', 'mart', 'market', 'store', 'provision',
    'walmart', 'costco', 'target', 'kroger', 'aldi', 'lidl', 'tesco',
    'big bazaar', 'dmart', 'reliance fresh', 'more', 'ratnadeep',
    'fresh', 'organic', 'vegetable', 'fruit',
  ],
  transport: [
    'uber', 'lyft', 'ola', 'rapido', 'taxi', 'cab', 'ride',
    'parking', 'fuel', 'gas station', 'petrol', 'diesel',
    'metro', 'bus', 'train', 'toll', 'highway',
    'shell', 'bp', 'indian oil', 'hp petrol', 'bharat petroleum',
  ],
  shopping: [
    'mall', 'clothing', 'fashion', 'apparel', 'shoe', 'accessory',
    'amazon', 'flipkart', 'myntra', 'zara', 'h&m', 'uniqlo',
    'electronics', 'appliance', 'hardware', 'furniture',
  ],
  medical: [
    'pharmacy', 'hospital', 'clinic', 'medical', 'doctor', 'health',
    'medicine', 'drug', 'lab', 'diagnostic', 'dental', 'optical',
    'apollo', 'medplus', 'netmeds',
  ],
  entertainment: [
    'cinema', 'movie', 'theater', 'theatre', 'concert', 'show',
    'ticket', 'amusement', 'park', 'game', 'arcade', 'bowling',
    'netflix', 'spotify', 'bookmyshow', 'pvr', 'inox',
  ],
  utilities: [
    'electric', 'water', 'gas bill', 'internet', 'wifi', 'broadband',
    'phone bill', 'mobile recharge', 'airtel', 'jio', 'vodafone',
  ],
  rent: [
    'rent', 'lease', 'housing', 'apartment', 'flat', 'pg',
  ],
  travel: [
    'hotel', 'resort', 'hostel', 'airbnb', 'oyo', 'booking.com',
    'airline', 'flight', 'airport', 'makemytrip', 'goibibo',
    'irctc', 'redbus', 'visa fee', 'passport',
  ],
};

function guessCategory(lines: string[], description: string): string {
  const searchText = [...lines.slice(0, 10), description]
    .join(' ')
    .toLowerCase();

  let bestCategory = 'other';
  let bestScore = 0;

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (searchText.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  return bestCategory;
}
