import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const token  = auth.getToken();
  const apiKey = auth.getApiKey();

  const headers: Record<string, string> = {};
  if (token)  headers['Authorization'] = `Bearer ${token}`;
  if (apiKey) headers['X-Api-Key']     = apiKey;

  if (!Object.keys(headers).length) return next(req);
  return next(req.clone({ setHeaders: headers }));
};
