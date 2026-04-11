import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../toast/toast.service';

/** Centrally handles HTTP errors — maps status codes to user-friendly toasts */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth  = inject(AuthService);
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: { status: number; error?: { retry_after?: number; message?: string } }) => {
      switch (err.status) {
        case 401:
          // Only auto-logout if the user already has a token (i.e. session expired).
          // If there's no token, the guard will handle redirect — don't double-navigate.
          if (auth.getToken()) {
            auth.logout();
            toast.error('Session expired. Please sign in again.');
          }
          break;
        case 429:
          toast.warning(`Rate limit hit. Retry after ${err.error?.retry_after ?? 60} s.`);
          break;
        case 503:
          toast.error('Server is busy. Please try again in a moment.');
          break;
        default:
          if (err.status >= 500) {
            toast.error('Server error. Please try again.');
          }
      }
      return throwError(() => err);
    }),
  );
};
