import { apiClient } from './api';
import {
  AdminGamificationLeaderboards,
  AdminOrganizationSettings,
  AdminTenantSettings,
  AdminUpdateSettingsPayload,
  OnboardingPayload,
  OnboardingResult,
  SchedulerRunSummary,
} from '../types/admin';

/** Administration endpoints (settings sections, scheduler, onboarding, recognition) not in services/api.ts. */
export const adminApi = {
  /** Effective organization settings, including the CAPA, recognition and digest settings. */
  getSettings: async (): Promise<AdminOrganizationSettings> => {
    const res = await apiClient.get('/settings');
    return res.data;
  },
  getDefaultSettings: async (): Promise<AdminTenantSettings> => {
    const res = await apiClient.get('/settings/defaults');
    return res.data;
  },
  /** Org admins only. Any subset of sections; returns the full effective settings. */
  updateSettings: async (data: AdminUpdateSettingsPayload): Promise<AdminOrganizationSettings> => {
    const res = await apiClient.patch('/settings', data);
    return res.data;
  },
  /** Org admins only: one reminder / escalation / digest pass for this organization. Reminders already sent are not repeated. */
  runReminders: async (): Promise<SchedulerRunSummary> => {
    const res = await apiClient.post('/notifications/run-scheduler');
    return res.data;
  },
  /** Super admins only: create an organization through the onboarding wizard. */
  executeOnboarding: async (data: OnboardingPayload): Promise<OnboardingResult> => {
    const res = await apiClient.post('/tenants/onboard', data);
    return res.data;
  },
  getGamificationLeaderboards: async (): Promise<AdminGamificationLeaderboards> => {
    const res = await apiClient.get('/analytics/gamification/leaderboards');
    return res.data;
  },
};
