import { useCachedSettings } from '../../hooks/useTerminology';
import { OrganizationSettings } from '../../types';
import { GamificationSettings } from '../../types/admin';

/** Platform default: recognition on, individual leaderboard shown (backend DEFAULT_TENANT_SETTINGS.gamification). */
export const DEFAULT_GAMIFICATION_SETTINGS: GamificationSettings = { enabled: true, showIndividualLeaderboard: true };

/**
 * The organization's recognition settings from the cached GET /settings response. Servers that predate the
 * setting omit the section, which means the defaults apply.
 */
export const readGamificationSettings = (settings: OrganizationSettings | null): GamificationSettings => {
  if (!settings || !('gamification' in settings)) return DEFAULT_GAMIFICATION_SETTINGS;
  const section: unknown = settings.gamification;
  if (!section || typeof section !== 'object') return DEFAULT_GAMIFICATION_SETTINGS;
  const enabled = 'enabled' in section && typeof section.enabled === 'boolean' ? section.enabled : DEFAULT_GAMIFICATION_SETTINGS.enabled;
  const showIndividualLeaderboard =
    'showIndividualLeaderboard' in section && typeof section.showIndividualLeaderboard === 'boolean'
      ? section.showIndividualLeaderboard
      : DEFAULT_GAMIFICATION_SETTINGS.showIndividualLeaderboard;
  return { enabled, showIndividualLeaderboard };
};

/**
 * Recognition settings for the signed-in organization, plus whether they have loaded. Navigation can hide the
 * recognition entry with `loaded && !settings.enabled`.
 */
export const useRecognitionSettings = (): { settings: GamificationSettings; loaded: boolean } => {
  const cached = useCachedSettings();
  return { settings: readGamificationSettings(cached), loaded: cached !== null };
};
