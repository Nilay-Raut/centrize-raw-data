/**
 * Production environment configuration.
 *
 * Angular swaps this file in at prod build time via fileReplacements in project.json:
 *   { "replace": "src/environments/environment.ts",
 *     "with":    "src/environments/environment.prod.ts" }
 *
 * Update apiBase to your actual production API hostname before deploying.
 */
export const environment = {
  production: true,
  apiBase: 'https://api.yourdomain.com',
};
