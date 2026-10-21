/** Display helpers for the account security page (dates and times come from useI18n()). */

/** Turns a raw User-Agent string into a short label such as "Chrome on Windows". */
export const describeUserAgent = (ua: string | null | undefined): { label: string; mobile: boolean } => {
  const s = (ua || '').trim();
  if (!s) return { label: 'Unknown device', mobile: false };

  let browser = '';
  if (/Edg(e|A|iOS)?\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(s)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = 'Safari';
  else if (/okhttp|Dart\/|Expo|ReactNative|CFNetwork/i.test(s)) browser = '5S mobile app';
  else if (/PostmanRuntime/i.test(s)) browser = 'Postman';
  else if (/curl\//i.test(s)) browser = 'curl';
  else if (/node-fetch|axios|undici|node/i.test(s)) browser = 'API client';

  let os = '';
  if (/Windows NT/.test(s)) os = 'Windows';
  else if (/iPhone/.test(s)) os = 'iPhone';
  else if (/iPad/.test(s)) os = 'iPad';
  else if (/Android/.test(s)) os = 'Android';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';

  const mobile = /Mobi|Android|iPhone|iPad/.test(s);
  if (browser && os) return { label: `${browser} on ${os}`, mobile };
  if (browser) return { label: browser, mobile };
  if (os) return { label: `Browser on ${os}`, mobile };
  return { label: s.length > 40 ? `${s.slice(0, 40)}…` : s, mobile };
};

export const describeAuthMethod = (method: string | null | undefined): string => {
  const m = (method || '').toUpperCase();
  const base = m.startsWith('PIN') ? 'Badge PIN' : m.startsWith('PASSWORD') ? 'Password' : m.startsWith('SSO') ? 'SSO' : m || 'Sign-in';
  return m.includes('MFA') ? `${base} + two-factor` : base;
};
