import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    // Shell wraps all authenticated pages — provides sidebar + toast overlay
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'insights',
        loadComponent: () =>
          import('./features/insights/insights.component').then((m) => m.InsightsComponent),
      },
      {
        path: 'upload',
        loadComponent: () =>
          import('./features/upload/upload.component').then((m) => m.UploadComponent),
      },
      {
        path: 'query',
        loadComponent: () =>
          import('./features/query/query-builder.component').then((m) => m.QueryBuilderComponent),
      },
      {
        path: 'jobs',
        loadComponent: () =>
          import('./features/jobs/jobs-list.component').then((m) => m.JobsListComponent),
      },
      {
        path: 'keys',
        loadComponent: () =>
          import('./features/keys/api-keys.component').then((m) => m.ApiKeysComponent),
      },
      { path: '', redirectTo: 'insights', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
