import type { ApplicationConfig } from '@angular/core';
import { provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/api/error.interceptor';
import { API_BASE_URL } from '@cdp/api-client';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withRouterConfig({ onSameUrlNavigation: 'reload' })),

    // HTTP: interceptors run in order — auth first (attaches Bearer token),
    // then error (maps status codes to toasts + auto-logout on 401).
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),

    // Backend base URL — consumed by QueryApiService and AuthService.
    // Swap environment.ts → environment.prod.ts at build time for production.
    { provide: API_BASE_URL, useValue: environment.apiBase },
  ],
};
