/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the Express API. Documented in `render.yaml`, consumed in
   * `src/lib/api.ts`. No local `.env` file in dev - falls back to
   * `http://localhost:3000`.
   */
  readonly VITE_API_URL?: string
  /** Public source repository URL shown on the About page. Defaults to the author's GitHub profile. */
  readonly VITE_REPO_URL?: string
  /** Public URL of this deployed site. The "Live demo" link is hidden when unset. */
  readonly VITE_LIVE_URL?: string
}
