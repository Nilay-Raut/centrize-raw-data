import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // Read directly from sessionStorage — avoids any signal/zone timing gap.
  // isLoggedIn signal and getToken() are always in sync, but getToken() is the
  // authoritative source (it's what the interceptor uses too).
  return auth.getToken() ? true : router.createUrlTree(['/login']);
};
