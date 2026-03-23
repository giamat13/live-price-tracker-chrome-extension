// ========================
// currency.js
// המרת מטבעות לשקל בזמן אמת
// ========================

const CURRENCY_CACHE_KEY = 'currencyRates';
const CACHE_TTL_MS = 60 * 60 * 1000; // שעה אחת

// סימנים וקודים של מטבעות
const CURRENCY_SYMBOLS = {
  '₪': 'ILS', 'il': 'ILS', 'ils': 'ILS',
  '$':  'USD',
  '€':  'EUR',
  '£':  'GBP',
  '¥':  'JPY',
  '₹':  'INR',
  '₩':  'KRW',
  '₺':  'TRY',
  'A$': 'AUD',
  'C$': 'CAD',
  'Fr': 'CHF',
  'kr': 'SEK',  // שוודי/נורווגי/דני — קירוב
  '₴': 'UAH',
  '₦': 'NGN',
  '฿': 'THB',
  'zł': 'PLN',
  'R':  'ZAR',
  // קודים טקסטואליים
  'USD': 'USD', 'EUR': 'EUR', 'GBP': 'GBP',
  'JPY': 'JPY', 'ILS': 'ILS', 'AUD': 'AUD',
  'CAD': 'CAD', 'CHF': 'CHF', 'CNY': 'CNY',
  'INR': 'INR', 'KRW': 'KRW', 'TRY': 'TRY',
};

// ========================
// טעינת שערים (cache + fetch)
// ========================
async function getCurrencyRates() {
  // 1. בדוק cache
  try {
    const stored = await chrome.storage.local.get([CURRENCY_CACHE_KEY]);
    const cache = stored[CURRENCY_CACHE_KEY];
    if (cache && cache.rates && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS) {
      return cache.rates;
    }
  } catch (_) {}

  // 2. שלוף שערים חיים
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/ILS');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();

    if (data && data.rates) {
      // ה-API מחזיר: כמה מטבע X שווה ל-1 ILS
      // אנחנו צריכים: כמה ILS שווה 1 מטבע X → הפוך
      const rates = {};
      for (const [code, rate] of Object.entries(data.rates)) {
        rates[code] = 1 / rate; // 1 USD = X ILS
      }
      rates['ILS'] = 1;

      await chrome.storage.local.set({
        [CURRENCY_CACHE_KEY]: { rates, fetchedAt: Date.now() }
      });
      return rates;
    }
  } catch (err) {
    console.warn('currency.js: לא ניתן לשלוף שערים:', err.message);
  }

  // 3. fallback — שערים קבועים
  return {
    ILS: 1,
    USD: 3.70,
    EUR: 4.05,
    GBP: 4.70,
    JPY: 0.025,
    INR: 0.044,
    KRW: 0.0027,
    TRY: 0.11,
    AUD: 2.40,
    CAD: 2.72,
    CHF: 4.20,
    SEK: 0.35,
    CNY: 0.51,
    UAH: 0.089,
    THB: 0.108,
    PLN: 0.93,
    ZAR: 0.20,
  };
}

// ========================
// זיהוי מטבע + המרה לשקל
// ========================

/**
 * מנתח טקסט מחיר → { amount, currency, amountILS }
 * מחזיר null אם לא נמצא מחיר
 */
async function parseAndConvertPrice(text) {
  if (!text) return null;
  const rates = await getCurrencyRates();
  return parsePriceWithRates(text, rates);
}

/**
 * גרסה סינכרונית (עם rates שכבר נטענו)
 */
function parsePriceWithRates(text, rates) {
  if (!text) return null;
  const cleaned = text.replace(/,/g, '').trim();

  // רשימת תבניות לזיהוי (לפי סדר עדיפות)
  const patterns = [
    // A$ / C$ לפני $
    { re: /A\$\s*([\d.]+)|([\d.]+)\s*A\$/g,  code: 'AUD' },
    { re: /C\$\s*([\d.]+)|([\d.]+)\s*C\$/g,  code: 'CAD' },
    // סימנים
    { re: /₪\s*([\d.]+)|([\d.]+)\s*₪/g,      code: 'ILS' },
    { re: /\$\s*([\d.]+)|([\d.]+)\s*\$/g,     code: 'USD' },
    { re: /€\s*([\d.]+)|([\d.]+)\s*€/g,       code: 'EUR' },
    { re: /£\s*([\d.]+)|([\d.]+)\s*£/g,       code: 'GBP' },
    { re: /¥\s*([\d.]+)|([\d.]+)\s*¥/g,       code: 'JPY' },
    { re: /₹\s*([\d.]+)|([\d.]+)\s*₹/g,       code: 'INR' },
    { re: /₩\s*([\d.]+)|([\d.]+)\s*₩/g,       code: 'KRW' },
    { re: /₺\s*([\d.]+)|([\d.]+)\s*₺/g,       code: 'TRY' },
    { re: /₴\s*([\d.]+)|([\d.]+)\s*₴/g,       code: 'UAH' },
    { re: /฿\s*([\d.]+)|([\d.]+)\s*฿/g,       code: 'THB' },
    { re: /zł\s*([\d.]+)|([\d.]+)\s*zł/g,     code: 'PLN' },
    // קודים טקסטואליים (אחרי הסימנים)
    { re: /USD\s*([\d.]+)|([\d.]+)\s*USD/gi,  code: 'USD' },
    { re: /EUR\s*([\d.]+)|([\d.]+)\s*EUR/gi,  code: 'EUR' },
    { re: /GBP\s*([\d.]+)|([\d.]+)\s*GBP/gi, code: 'GBP' },
    { re: /ILS\s*([\d.]+)|([\d.]+)\s*ILS/gi, code: 'ILS' },
    { re: /JPY\s*([\d.]+)|([\d.]+)\s*JPY/gi, code: 'JPY' },
    { re: /CAD\s*([\d.]+)|([\d.]+)\s*CAD/gi, code: 'CAD' },
    { re: /AUD\s*([\d.]+)|([\d.]+)\s*AUD/gi, code: 'AUD' },
    { re: /CHF\s*([\d.]+)|([\d.]+)\s*CHF/gi, code: 'CHF' },
    { re: /CNY\s*([\d.]+)|([\d.]+)\s*CNY/gi, code: 'CNY' },
  ];

  const found = [];

  for (const { re, code } of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      const amount = parseFloat(m[1] || m[2]);
      if (!isNaN(amount) && amount > 0) {
        const rate = rates[code] || 1;
        found.push({ amount, currency: code, amountILS: parseFloat((amount * rate).toFixed(2)) });
      }
    }
    if (found.length > 0) break; // קח את הסימן הראשון שנמצא
  }

  if (found.length === 0) {
    // fallback — מספר ללא סימן מטבע (דלג על אחוזים)
    const lines = cleaned.split(/[\n\r]+/);
    for (const line of lines) {
      if (line.trim().endsWith('%') || /^-\d/.test(line.trim())) continue;
      const m = line.match(/[\d.]+/);
      if (m) {
        const amount = parseFloat(m[0]);
        return { amount, currency: 'ILS', amountILS: amount };
      }
    }
    return null;
  }

  // אם כמה מחירים (מקורי + מבצע), קח את הקטן ביותר
  found.sort((a, b) => a.amountILS - b.amountILS);
  return found[0];
}

/**
 * פורמט להצגה: "50.00 USD → ₪185.00"
 */
function formatConversion(parsed) {
  if (!parsed) return '';
  if (parsed.currency === 'ILS') return `₪${parsed.amountILS}`;
  return `${parsed.amount} ${parsed.currency} → ₪${parsed.amountILS}`;
}

/**
 * שם מלא של מטבע
 */
function getCurrencyName(code) {
  const names = {
    ILS: 'שקל', USD: 'דולר אמריקאי', EUR: 'יורו', GBP: 'פאונד בריטי',
    JPY: 'ין יפני', INR: 'רופי הודי', KRW: 'וואן קוריאני',
    TRY: 'לירה טורקית', AUD: 'דולר אוסטרלי', CAD: 'דולר קנדי',
    CHF: 'פרנק שוויצרי', SEK: 'כתר שוודי', CNY: 'יואן סיני',
    UAH: 'הריבניה אוקראינית', THB: 'בהט תאילנדי', PLN: 'זלוטי פולני',
    ZAR: 'רנד דרום אפריקאי',
  };
  return names[code] || code;
}