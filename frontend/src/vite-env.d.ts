/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend REST API, e.g. http://localhost:3001/api/v1 */
  readonly VITE_API_URL?: string;
  /** The Role Portals tab (demo accounts) is shown unless this is 'false'. */
  readonly VITE_SHOW_DEMO_PORTALS?: string;
  /** 'true' shows the SSO Login tab; only set once SSO is configured on the backend. */
  readonly VITE_SSO_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
