import { InjectionToken } from '@angular/core';

/**
 * API_BASE_URL — single source of truth for the backend origin.
 *
 * Provided once in app.config.ts using environment.ts:
 *   { provide: API_BASE_URL, useValue: environment.apiBase }
 *
 * Every service that needs the backend URL injects this token.
 * Never hardcode 'http://localhost:3000' in any service — use this.
 *
 * Dev  → http://localhost:3000   (environment.ts)
 * Prod → https://api.yourdomain.com  (environment.prod.ts)
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
