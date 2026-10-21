/**
 * Plan catalogue defaults and the pure subscription-state rules shared by the request pipeline
 * (JwtStrategy) and the subscription API. Prices and limits are editable by platform administrators;
 * these are only the values created on first start-up.
 */
export const FEATURES = ['ADVANCED_ANALYTICS', 'REPORTS_EXPORT', 'GAMIFICATION', 'API_ACCESS', 'WEBHOOKS'] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  ADVANCED_ANALYTICS: 'Management KPIs, drill-down, benchmarking and certification',
  REPORTS_EXPORT: 'Excel / CSV / PDF export of registers',
  GAMIFICATION: 'Recognition: XP, badges, leaderboards, trophies and kudos',
  API_ACCESS: 'API keys for integrations',
  WEBHOOKS: 'Outbound webhooks',
};

/** Every plan is priced in Indian rupees; the platform has one billing currency. */
export const PLATFORM_CURRENCY = 'INR';

export interface PlanDefinition {
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  maxUsers: number | null;
  maxLocations: number | null;
  storageQuotaMb: number;
  features: Feature[];
  sortOrder: number;
}

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'Digital 5S audits, findings, corrective actions, red tags and the mobile app for a single site.',
    priceMonthly: 7999,
    maxUsers: 25,
    maxLocations: 25,
    storageQuotaMb: 5 * 1024,
    features: [],
    sortOrder: 1,
  },
  {
    code: 'PROFESSIONAL',
    name: 'Professional',
    description: 'Adds management analytics, report exports and recognition for multi-department programmes.',
    priceMonthly: 29999,
    maxUsers: 150,
    maxLocations: 300,
    storageQuotaMb: 50 * 1024,
    features: ['ADVANCED_ANALYTICS', 'REPORTS_EXPORT', 'GAMIFICATION'],
    sortOrder: 2,
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Unlimited users and locations, integrations (API keys, webhooks) for multi-plant organisations.',
    priceMonthly: 124999,
    maxUsers: null,
    maxLocations: null,
    storageQuotaMb: 500 * 1024,
    features: [...FEATURES],
    sortOrder: 3,
  },
];

/** Monthly prices of the default plans when the catalogue was priced in US dollars (replaced by the rupee prices above). */
export const LEGACY_USD_DEFAULT_PRICES: Record<string, number> = { STARTER: 99, PROFESSIONAL: 399, ENTERPRISE: 1499 };

export interface SubscriptionInput {
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  plan: { code: string; features: string } | null;
}

export interface SubscriptionState {
  planCode: string | null;
  features: string[];
  /** When true, data can be read and exported but not changed. */
  readOnly: boolean;
  readOnlyReason: 'TRIAL_EXPIRED' | 'SUBSCRIPTION_LAPSED' | null;
}

export const graceDays = () => Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? 7);

export function parseFeatures(raw: string | null | undefined): string[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

export function subscriptionState(t: SubscriptionInput, now = new Date()): SubscriptionState {
  let readOnlyReason: SubscriptionState['readOnlyReason'] = null;
  if (t.status === 'TRIAL' && t.trialEndsAt && t.trialEndsAt < now) readOnlyReason = 'TRIAL_EXPIRED';
  if (t.status === 'ACTIVE' && t.currentPeriodEnd && t.currentPeriodEnd.getTime() + graceDays() * 86400000 < now.getTime()) {
    readOnlyReason = 'SUBSCRIPTION_LAPSED';
  }
  return {
    planCode: t.plan?.code ?? null,
    // A tenant without a plan keeps full functionality (fail-open for commercial gating only)
    features: t.plan ? parseFeatures(t.plan.features) : [...FEATURES],
    readOnly: readOnlyReason !== null,
    readOnlyReason,
  };
}
