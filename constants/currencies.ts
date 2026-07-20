export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: CurrencyConfig[] = [
  // Major
  { code: 'USD', symbol: '$',    name: 'US Dollar' },
  { code: 'EUR', symbol: '€',   name: 'Euro' },
  { code: 'GBP', symbol: '£',   name: 'British Pound' },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee' },
  { code: 'JPY', symbol: '¥',   name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥',   name: 'Chinese Yuan' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  // Americas
  { code: 'CAD', symbol: 'C$',  name: 'Canadian Dollar' },
  { code: 'BRL', symbol: 'R$',  name: 'Brazilian Real' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
  { code: 'COP', symbol: 'CO$', name: 'Colombian Peso' },
  { code: 'PEN', symbol: 'S/',  name: 'Peruvian Sol' },
  // Europe
  { code: 'SEK', symbol: 'kr',  name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr',  name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr',  name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł',  name: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč',  name: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft',  name: 'Hungarian Forint' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'TRY', symbol: '₺',   name: 'Turkish Lira' },
  { code: 'RUB', symbol: '₽',   name: 'Russian Ruble' },
  { code: 'UAH', symbol: '₴',   name: 'Ukrainian Hryvnia' },
  // Asia-Pacific
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
  { code: 'KRW', symbol: '₩',   name: 'South Korean Won' },
  { code: 'THB', symbol: '฿',   name: 'Thai Baht' },
  { code: 'MYR', symbol: 'RM',  name: 'Malaysian Ringgit' },
  { code: 'IDR', symbol: 'Rp',  name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱',   name: 'Philippine Peso' },
  { code: 'VND', symbol: '₫',   name: 'Vietnamese Dong' },
  { code: 'PKR', symbol: '₨',   name: 'Pakistani Rupee' },
  { code: 'BDT', symbol: '৳',   name: 'Bangladeshi Taka' },
  { code: 'LKR', symbol: 'Rs',  name: 'Sri Lankan Rupee' },
  { code: 'NPR', symbol: 'Rs',  name: 'Nepalese Rupee' },
  // Middle East & Africa
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼',   name: 'Saudi Riyal' },
  { code: 'QAR', symbol: 'QR',  name: 'Qatari Riyal' },
  { code: 'KWD', symbol: 'KD',  name: 'Kuwaiti Dinar' },
  { code: 'BHD', symbol: 'BD',  name: 'Bahraini Dinar' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani Rial' },
  { code: 'EGP', symbol: 'E£',  name: 'Egyptian Pound' },
  { code: 'ZAR', symbol: 'R',   name: 'South African Rand' },
  { code: 'NGN', symbol: '₦',   name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  { code: 'ILS', symbol: '₪',   name: 'Israeli Shekel' },
];

export const DEFAULT_CURRENCY = 'USD';

export const getCurrencySymbol = (code: string): string =>
  CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
