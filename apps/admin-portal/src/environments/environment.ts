/**
 * Development environment configuration.
 *
 * This file is imported by app.config.ts to provide the API_BASE_URL token.
 * For production builds, Angular replaces this file with environment.prod.ts
 * via the fileReplacements config in project.json / angular.json.
 */
export const environment = {
  production: false,
  apiBase: 'http://localhost:3000',
  // apiBase: 'http://192.168.31.36:3000'
};
