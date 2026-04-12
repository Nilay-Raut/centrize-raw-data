import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { API_BASE_URL } from '@cdp/api-client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);
  private base   = inject(API_BASE_URL);

  isLoggedIn = signal(false);

  constructor() {
    this.isLoggedIn.set(!!this.getToken());
  }

  login(credentials: { email: string; password: string; apiKey?: string }) {
    return this.http
      .post<{ token: string }>(`${this.base}/api/auth/login`, credentials)
      .pipe(
        tap(({ token }) => {
          // sessionStorage: clears on tab close — safer than localStorage
          sessionStorage.setItem('cdp_token', token);
          this.isLoggedIn.set(true);
        }),
      );
  }

  logout(): void {
    sessionStorage.removeItem('cdp_token');
    sessionStorage.removeItem('cdp_api_key');
    this.isLoggedIn.set(false);
    void this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return sessionStorage.getItem('cdp_token');
  }

  /** Store the platform API key for this session (format: cdp_<...>). */
  setApiKey(key: string): void {
    sessionStorage.setItem('cdp_api_key', key);
  }

  /** Returns the stored platform API key, or null if not set. */
  getApiKey(): string | null {
    return sessionStorage.getItem('cdp_api_key');
  }
}
