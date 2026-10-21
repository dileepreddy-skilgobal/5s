/**
 * Public base URL of the web frontend, used in links embedded in calendar invites,
 * certificates and notifications. Configure FRONTEND_URL per environment.
 */
export function getFrontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
}
