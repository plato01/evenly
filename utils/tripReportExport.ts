/**
 * Trip report export — CSV (spreadsheet) and PDF (via expo-print).
 *
 * PDF falls back to a styled self-contained HTML file when the expo-print
 * native module isn't in the current dev-client build yet (dynamic import +
 * runtime try/catch, same pattern as the Firebase lazy-load). The HTML opens
 * in any browser and prints to PDF from there, so nothing is blocked.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { Expense, TripBudget, TripBudgetSummary } from '../types';
import { formatCurrency } from './currency';
import { formatDate } from './dateUtils';

export interface TripReportData {
  groupName: string;
  tripBudget: TripBudget;
  summary: TripBudgetSummary;
  expenses: Expense[];
  /** Resolve a userId to a display name. */
  nameOf: (userId: string) => string;
  topSpenders: { name: string; amount: number }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food',
  transport: 'Transport',
  accommodation: 'Accommodation',
  activities: 'Activities',
  miscellaneous: 'Miscellaneous',
};

const csvCell = (v: string | number): string =>
  typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`;

export function buildTripCsv(data: TripReportData): string {
  const { tripBudget, summary, expenses, nameOf } = data;
  const c = tripBudget.currency;
  const lines: string[] = [
    `Trip Report,${csvCell(data.groupName)}${tripBudget.destination ? `,${csvCell(tripBudget.destination)}` : ''}`,
    `Dates,${formatDate(tripBudget.startDate)},${formatDate(tripBudget.endDate)}`,
    `Budget,${tripBudget.totalBudget},${c}`,
    `Total Spent,${summary.totalSpent},${c}`,
    `Remaining,${tripBudget.totalBudget - summary.totalSpent},${c}`,
    '',
    'Date,Description,Category,Paid By,Amount,Currency',
  ];
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    lines.push([
      e.date.slice(0, 10),
      csvCell(e.description),
      csvCell(e.category),
      csvCell(nameOf(e.paidBy)),
      e.totalAmount,
      e.currency,
    ].join(','));
  }
  return lines.join('\n');
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildTripReportHtml(data: TripReportData): string {
  const { groupName, tripBudget, summary, expenses, nameOf, topSpenders } = data;
  const c = tripBudget.currency;
  const remaining = tripBudget.totalBudget - summary.totalSpent;
  const isOver = remaining < 0;

  const statCard = (label: string, value: string, color = '#0F172A') => `
    <div class="stat"><div class="stat-label">${label}</div>
    <div class="stat-value" style="color:${color}">${value}</div></div>`;

  const catRows = summary.categoryBreakdown.map((cat) => {
    const pct = cat.budgeted > 0 ? Math.min(100, Math.round((cat.spent / cat.budgeted) * 100)) : 0;
    const over = cat.budgeted > 0 && cat.spent > cat.budgeted;
    return `<tr>
      <td>${CATEGORY_LABELS[cat.category] ?? cat.category}</td>
      <td class="num">${formatCurrency(cat.spent, c)}</td>
      <td class="num">${formatCurrency(cat.budgeted, c)}</td>
      <td><div class="bar"><div class="bar-fill" style="width:${pct}%;background:${over ? '#DC2626' : '#6C5CE7'}"></div></div></td>
    </tr>`;
  }).join('');

  const spenderRows = topSpenders.map((sp, i) =>
    `<tr><td>#${i + 1}</td><td>${esc(sp.name)}</td><td class="num">${formatCurrency(sp.amount, c)}</td></tr>`
  ).join('');

  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  const expenseRows = sorted.map((e) =>
    `<tr><td>${e.date.slice(0, 10)}</td><td>${esc(e.description)}</td><td>${esc(e.category)}</td>
     <td>${esc(nameOf(e.paidBy))}</td><td class="num">${formatCurrency(e.totalAmount, e.currency)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body { font-family: -apple-system, Roboto, 'Segoe UI', sans-serif; color: #0F172A; margin: 32px; }
    h1 { margin: 0 0 4px; font-size: 26px; }
    h2 { font-size: 16px; margin: 28px 0 10px; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px; }
    .sub { color: #64748B; font-size: 13px; margin-bottom: 2px; }
    .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .stat { flex: 1; min-width: 120px; background: #F6F8FA; border-radius: 10px; padding: 12px; }
    .stat-label { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: .4px; }
    .stat-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: #64748B; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; padding: 6px 8px; border-bottom: 1px solid #E2E8F0; }
    td { padding: 7px 8px; border-bottom: 1px solid #F1F5F9; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .bar { background: #E2E8F0; border-radius: 4px; height: 8px; width: 140px; }
    .bar-fill { height: 8px; border-radius: 4px; }
    .verdict { margin-top: 24px; padding: 14px; border-radius: 10px; font-size: 14px;
      background: ${isOver ? '#FEF2F2' : '#F0FDF4'}; color: ${isOver ? '#991B1B' : '#166534'}; }
    .footer { margin-top: 28px; color: #94A3B8; font-size: 11px; }
  </style></head><body>
  <h1>${esc(groupName)} — Trip Report</h1>
  ${tripBudget.destination ? `<div class="sub">${esc(tripBudget.destination)}</div>` : ''}
  <div class="sub">${formatDate(tripBudget.startDate)} – ${formatDate(tripBudget.endDate)} · ${summary.daysElapsed}/${summary.daysTotal} days</div>

  <div class="stats">
    ${statCard('Total Budget', formatCurrency(tripBudget.totalBudget, c))}
    ${statCard('Total Spent', formatCurrency(summary.totalSpent, c))}
    ${statCard(isOver ? 'Over Budget' : 'Remaining', formatCurrency(Math.abs(remaining), c), isOver ? '#DC2626' : '#16A34A')}
    ${statCard('Burn Rate', `${summary.burnRate}%`, summary.burnRate > 90 ? '#DC2626' : '#0F172A')}
    ${statCard('Avg/Day Actual', formatCurrency(summary.perDayActual, c))}
    ${statCard('Avg/Day Budget', formatCurrency(summary.perDayBudget, c))}
  </div>

  <h2>Category Breakdown</h2>
  <table><tr><th>Category</th><th class="num">Spent</th><th class="num">Budgeted</th><th></th></tr>${catRows}</table>

  ${topSpenders.length ? `<h2>Top Spenders</h2>
  <table><tr><th></th><th>Member</th><th class="num">Paid</th></tr>${spenderRows}</table>` : ''}

  <h2>All Expenses (${sorted.length})</h2>
  <table><tr><th>Date</th><th>Description</th><th>Category</th><th>Paid By</th><th class="num">Amount</th></tr>${expenseRows}</table>

  <div class="verdict">${
    isOver
      ? `Trip went over budget by <b>${formatCurrency(Math.abs(remaining), c)}</b> — spent ${formatCurrency(summary.totalSpent, c)} against a ${formatCurrency(tripBudget.totalBudget, c)} budget.`
      : `Finished <b>${formatCurrency(remaining, c)}</b> under the ${formatCurrency(tripBudget.totalBudget, c)} budget.`
  }</div>
  <div class="footer">Generated by Evenly · ${new Date().toLocaleDateString()}</div>
  </body></html>`;
}

const safeName = (s: string): string =>
  s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'trip';

/** Export as CSV and open the share sheet. */
export async function exportTripCsv(data: TripReportData): Promise<void> {
  const file = new File(Paths.cache, `${safeName(data.groupName)}-trip-report.csv`);
  file.write(buildTripCsv(data));
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export Trip Report (CSV)' });
}

/**
 * Export as PDF and open the share sheet. Falls back to a styled HTML file
 * when expo-print's native module isn't in this build yet.
 */
export async function exportTripPdf(data: TripReportData): Promise<void> {
  const html = buildTripReportHtml(data);
  try {
    const Print = await import('expo-print');
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Trip Report (PDF)' });
  } catch {
    const file = new File(Paths.cache, `${safeName(data.groupName)}-trip-report.html`);
    file.write(html);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/html', dialogTitle: 'Export Trip Report' });
  }
}
