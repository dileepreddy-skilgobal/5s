/** The platform bills in one currency: every plan price and revenue figure is in Indian rupees. */
export const CURRENCY = 'INR';

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
const rupeesExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** ₹1,24,999 (Indian digit grouping); paise are shown only when the amount has them. */
export const formatInr = (amount: number | null | undefined): string => {
  const value = Number(amount ?? 0);
  return Number.isInteger(value) ? rupees.format(value) : rupeesExact.format(value);
};

/** Short form for headline figures: ₹85,000 · ₹4.5 L · ₹1.2 Cr (lakh = 1,00,000; crore = 1,00,00,000). */
export const formatInrCompact = (amount: number | null | undefined): string => {
  const value = Number(amount ?? 0);
  const abs = Math.abs(value);
  const short = (n: number) => String(Math.round(n * 10) / 10);
  if (abs >= 1e7) return `₹${short(value / 1e7)} Cr`;
  if (abs >= 1e5) return `₹${short(value / 1e5)} L`;
  return formatInr(value);
};
