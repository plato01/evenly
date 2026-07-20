/**
 * Receipt line-item parser — v3 (bug-fixed after audit).
 *
 * Fixed from audit:
 * - #1  _idCounter resets every call — no infinite growth
 * - #2  No lookbehinds — Hermes-safe
 * - #3  Digit correction ONLY on price zone, not item names
 * - #4  No mega-alternation regex — pre-compiled small patterns
 * - #6  Indian format accepts 3-digit first groups
 * - #7  Early return on empty strings after currency strip
 * - #8  Cross-validation tries two-item swaps, not just single
 * - #12 Capped at 200 lines
 */

export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  confidence: number;  // 0-1
  assignedTo: string[];
}

// —— CURRENCY SUPPORT (same as ocrParser v3 — pre-compiled, no mega-alternation) ——

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

function stripCurrency(text: string): string {
  let s = text;
  s = s.split('').filter(ch => !CURRENCY_SYMBOLS_SET.has(ch)).join('');
  for (const code of MULTI_CHAR_CURRENCY_LIST) {
    const idx = s.indexOf(code);
    if (idx !== -1) {
      s = s.slice(0, idx) + s.slice(idx + code.length);
    }
  }
  return s;
}

// —— OCR DIGIT CORRECTION ——

/** Conservative — safe for non-price text */
const DIGIT_MAP: Record<string, string> = {
  'O': '0', 'o': '0', 'Q': '0',
  'l': '1', 'I': '1', '|': '1', '!': '1',
  'Z': '2',
  'S': '5',
  'G': '6',
  'B': '8',
};

/** Aggressive — ONLY for price zones (#3 fix) */
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

/** Correct ONLY the rightmost ~15 chars (price zone), not item names */
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

/** Clean a price string — handles Indian/EU/US/Asian formats */
function cleanPrice(raw: string, lineContext?: string): number | null {
  let s = stripCurrency(raw).replace(/\s/g, '').trim();
  if (!s) return null; // #7 early return

  s = s.split('').map(ch => DIGIT_MAP[ch] ?? ch).join('');

  // Indian format (#6 fix: accepts 1-3 digit first group)
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
  } else if (commaCount >= 1 && dotCount >= 1) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (commaCount === 1 && dotCount === 0) {
    const parts = s.split(',');
    const afterComma = parts[1];
    if (afterComma && afterComma.length === 3) {
      s = s.replace(',', '');
    } else if (afterComma && afterComma.length === 2) {
      if (lineContext && /[₹]|Rs\.?|INR/i.test(lineContext)) {
        s = s.replace(',', '');
      } else if (lineContext && /[€]|EUR/i.test(lineContext)) {
        s = s.replace(',', '.');
      } else {
        const beforeComma = parseInt(parts[0]);
        if (beforeComma < 100) s = s.replace(',', '.');
        else s = s.replace(',', '');
      }
    } else {
      s = s.replace(',', '');
    }
  } else {
    s = s.replace(/,/g, '');
  }

  const dotParts = s.split('.');
  if (dotParts.length > 2) {
    s = dotParts.slice(0, -1).join('') + '.' + dotParts[dotParts.length - 1];
  }

  s = s.replace(/[^0-9.]/g, '');
  if (!s) return null;

  const num = parseFloat(s);
  if (isNaN(num) || num <= 0 || num >= 1_000_000_000) return null;

  if (lineContext && isNoDecimalCurrency(lineContext)) return Math.round(num);
  return Math.round(num * 100) / 100;
}

// —— PRICE EXTRACTION — 3 passes, Hermes-safe ——

function extractPriceFromEnd(line: string): { value: number; confidence: number } | null {
  const patterns = [
    /(\d{1,6}\.\d{1,2})\s*$/,
    /(\d{1,3}(?:,\d{2})+,\d{3}(?:\.\d{1,2})?)\s*$/,
    /(\d{1,3}(?:,\d{3})+\.\d{1,2})\s*$/,
    /(\d{1,6},\d{2})\s*$/,
    /(\d{2,9})\s*$/,
  ];

  // Pass 1: original line
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const val = cleanPrice(match[1], line);
      if (val !== null && val > 0) {
        return { value: val, confidence: 0.95 };
      }
    }
  }

  // Pass 2: price-zone correction only (#3 fix)
  const corrected = correctPriceZone(line);
  if (corrected !== line) {
    for (const pattern of patterns) {
      const match = corrected.match(pattern);
      if (match) {
        const val = cleanPrice(match[1], line);
        if (val !== null && val > 0) {
          return { value: val, confidence: 0.7 };
        }
      }
    }
  }

  // Pass 3: aggressive — correct everything and find any number
  const fullCorrected = line.split('').map(ch => AGGRESSIVE_DIGIT_MAP[ch] ?? ch).join('');
  const aggressiveMatch = fullCorrected.match(/(\d{1,8}\.\d{1,2})\s*$/);
  if (aggressiveMatch) {
    const val = parseFloat(aggressiveMatch[1]);
    if (!isNaN(val) && val > 0 && val < 1_000_000_000) {
      return { value: Math.round(val * 100) / 100, confidence: 0.5 };
    }
  }
  if (isNoDecimalCurrency(line)) {
    const wholeMatch = fullCorrected.match(/(\d{3,9})\s*$/);
    if (wholeMatch) {
      const val = parseInt(wholeMatch[1]);
      if (!isNaN(val) && val >= 1 && val < 1_000_000_000) {
        return { value: val, confidence: 0.5 };
      }
    }
  }

  return null;
}

// —— LINE CLASSIFICATION ——

const SKIP_PATTERNS = [
  /^(sub\s*total|subtotal|total|grand total|net total|amount|balance|due|change|cash|card|visa|master|amex)/i,
  /^(tax|vat|cgst|sgst|igst|gst|tip|gratuity|service charge|discount|savings)/i,
  /^(thank|receipt|invoice|bill|date|time|order|table|server|cashier|store|shop)/i,
  /^(tel|phone|fax|www|http|email|address)/i,
  /^(gst|gstin|tin|pan|cin|fssai)/i,
  /^[-=_.*]{3,}$/,
  /^\d{1,2}[/\-]\d{1,2}/,
  /^\d{5,}/,
  /^(итого|всего|сдача|наличные)/i,
  /^(toplam|kdv|nakit|kart)/i,
  /^(合計|合计|小計|小计|消費税|現金)/,
  /^(합계|부가세|현금|카드)/,
  /^(รวม|ภาษี|เงินสด)/,
  /^(tổng|thuế|tiền mặt)/i,
];

function isSkipLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  return SKIP_PATTERNS.some(p => p.test(lower));
}

function cleanItemName(line: string, price: number): string {
  const priceStr = price.toFixed(2);

  let name = line;

  const exactIdx = name.lastIndexOf(priceStr);
  if (exactIdx > 0) {
    name = name.slice(0, exactIdx);
  } else {
    name = name.replace(/[\d$₹€£¥₩₪₫₴₸₺₼₽﷼₡₣₦₧₨₯₰₱₲₳₵₶₷₾฿.,\s]+$/, '');
  }

  for (const code of MULTI_CHAR_CURRENCY_LIST) {
    if (name.trimEnd().endsWith(code)) {
      name = name.trimEnd().slice(0, -code.length);
    }
  }

  name = name.replace(/^\d+[-]\d+\s*/, '');
  name = name.replace(/^\d+\s*[xX×]\s+/, '');
  name = name.replace(/^\d{1,3}[.)]\s*/, '');
  name = name.replace(/[*#_=|]/g, '').trim();

  return name || 'Item';
}

// —— CROSS-VALIDATION — now tries two-item swaps (#8 fix) ——

const DIGIT_SWAPS: [number, number][] = [
  [1, 7], [7, 1], [0, 8], [8, 0], [5, 6], [6, 5],
  [3, 8], [8, 3], [1, 4], [4, 1], [6, 0], [0, 6],
  [9, 4], [4, 9], [1, 2], [2, 1], [3, 5], [5, 3],
  [0, 9], [9, 0], [2, 7], [7, 2],
];

function trySwapDigit(priceStr: string, from: number, to: number): number | null {
  for (let pos = 0; pos < priceStr.length; pos++) {
    if (priceStr[pos] !== String(from)) continue;
    const newStr = priceStr.substring(0, pos) + String(to) + priceStr.substring(pos + 1);
    const val = parseFloat(newStr);
    if (!isNaN(val) && val > 0) return Math.round(val * 100) / 100;
  }
  return null;
}

function tryFixMismatch(
  items: ReceiptItem[],
  targetSum: number
): { fixed: boolean; corrections: string[] } {
  const currentSum = items.reduce((s, item) => s + item.price, 0);
  if (Math.abs(currentSum - targetSum) < 0.02) return { fixed: true, corrections: [] };

  const corrections: string[] = [];

  // Pass 1: single-item fix
  for (const item of items) {
    const priceStr = item.price.toFixed(2);
    for (const [from, to] of DIGIT_SWAPS) {
      const newPrice = trySwapDigit(priceStr, from, to);
      if (newPrice === null) continue;
      const newSum = currentSum - item.price + newPrice;
      if (Math.abs(newSum - targetSum) < 0.02) {
        corrections.push(
          `Auto-corrected "${item.name}": $${item.price.toFixed(2)} → $${newPrice.toFixed(2)} (matches subtotal)`
        );
        item.price = newPrice;
        item.confidence = 0.6;
        return { fixed: true, corrections };
      }
    }
  }

  // Pass 2 (#8 fix): try fixing TWO items simultaneously
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const priceStrA = items[a].price.toFixed(2);
      const priceStrB = items[b].price.toFixed(2);

      for (const [fromA, toA] of DIGIT_SWAPS) {
        const newPriceA = trySwapDigit(priceStrA, fromA, toA);
        if (newPriceA === null) continue;

        for (const [fromB, toB] of DIGIT_SWAPS) {
          const newPriceB = trySwapDigit(priceStrB, fromB, toB);
          if (newPriceB === null) continue;

          const newSum = currentSum - items[a].price - items[b].price + newPriceA + newPriceB;
          if (Math.abs(newSum - targetSum) < 0.02) {
            corrections.push(
              `Auto-corrected "${items[a].name}": $${items[a].price.toFixed(2)} → $${newPriceA.toFixed(2)}`
            );
            corrections.push(
              `Auto-corrected "${items[b].name}": $${items[b].price.toFixed(2)} → $${newPriceB.toFixed(2)}`
            );
            items[a].price = newPriceA;
            items[a].confidence = 0.6;
            items[b].price = newPriceB;
            items[b].confidence = 0.6;
            return { fixed: true, corrections };
          }
        }
      }
    }
  }

  return { fixed: false, corrections: [] };
}

// —— MAIN PARSER ——

export function parseReceiptItems(ocrLines: string[]): {
  items: ReceiptItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  corrections: string[];
} {
  // #1 fix: reset counter every call
  let idCounter = 0;

  // #12: cap at 200 lines
  const lines = ocrLines.slice(0, 200);

  const items: ReceiptItem[] = [];
  let subtotal: number | null = null;
  let tax: number | null = null;
  let total: number | null = null;
  const corrections: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 3) continue;

    const lower = line.toLowerCase();
    const priceResult = extractPriceFromEnd(line);
    if (priceResult === null) continue;

    const { value: price, confidence } = priceResult;

    // Classify — check IGNORE patterns BEFORE total keywords
    if (/\btotal\s+(items|qty|quantity|savings|discount)\b/i.test(lower)) continue;
    if (/\b(you\s+saved|items\s+sold|cashback)\b/i.test(lower)) continue;

    if (/\b(grand\s*total|total\s*(due|amount|payable)?)\b/i.test(lower) && !lower.includes('sub')) {
      total = price; continue;
    }
    if (/\b(sub\s*total|subtotal)\b/i.test(lower)) {
      subtotal = price; continue;
    }
    if (/\b(tax|vat|cgst|sgst|igst|gst|cess|service\s*tax|swachh\s*bharat|krishi\s*kalyan)\b/i.test(lower)) {
      tax = (tax ?? 0) + price; continue;
    }
    if (/\b(tip|gratuity|service\s*charge)\b/i.test(lower)) continue;
    if (/\b(discount|savings|cash|change|card|visa|master)\b/i.test(lower)) continue;

    // Localized
    if (/\b(итого|всего|toplam|genel toplam|合計|合计|총액|합계|รวม|ยอดรวม|tổng cộng)\b/i.test(lower)) {
      total = price; continue;
    }
    if (/\b(小計|小计|소계)\b/.test(lower)) {
      subtotal = price; continue;
    }
    if (/\b(消費税|부가세|ภาษี|thuế|kdv|ндс)\b/i.test(lower)) {
      tax = (tax ?? 0) + price; continue;
    }

    if (isSkipLine(line)) continue;

    const name = cleanItemName(line, price);
    if (name.length < 2) continue;

    idCounter++;
    items.push({
      id: `item_${idCounter}`,
      name,
      price,
      confidence,
      assignedTo: [],
    });
  }

  // Cross-validation (#8 fix: now handles two-item errors too)
  if (subtotal !== null && items.length > 0) {
    const itemsSum = Math.round(items.reduce((s, item) => s + item.price, 0) * 100) / 100;
    const diff = Math.abs(itemsSum - subtotal);

    if (diff > 0.02 && diff < subtotal * 0.3) {
      const fix = tryFixMismatch(items, subtotal);
      corrections.push(...fix.corrections);
      if (!fix.fixed) {
        corrections.push(
          `⚠️ Items sum to $${itemsSum.toFixed(2)} but subtotal is $${subtotal.toFixed(2)} — check prices manually`
        );
      }
    }
  }

  if (total !== null && subtotal !== null && tax !== null) {
    const expectedTotal = subtotal + tax;
    if (Math.abs(expectedTotal - total) > 0.10) {
      corrections.push(
        `⚠️ Subtotal ($${subtotal.toFixed(2)}) + Tax ($${tax.toFixed(2)}) = $${expectedTotal.toFixed(2)}, but total says $${total.toFixed(2)}`
      );
    }
  }

  return { items, subtotal, tax, total, corrections };
}
