/**
 * ShellComponent — authenticated layout wrapper.
 *
 * Renders the sidebar navigation + top bar. All protected routes
 * are children rendered in the <router-outlet>. Toast notifications
 * are also rendered here so they overlay any child page.
 *
 * Route: path '' canActivate:[authGuard] component:ShellComponent { children }
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { ToastService, Toast } from '../core/toast/toast.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <!-- Sidebar -->
      <nav class="sidebar">
        <div class="sidebar-brand">
          <span class="brand-icon">📊</span>
          <span class="brand-name">CDP</span>
        </div>

        <div class="nav-section">
          <a routerLink="/insights" routerLinkActive="active" class="nav-item">
            <span class="nav-icon">📊</span> Insights
          </a>
          <a routerLink="/query"  routerLinkActive="active" class="nav-item">
            <span class="nav-icon">🔍</span> Query
          </a>
          <a routerLink="/upload" routerLinkActive="active" class="nav-item">
            <span class="nav-icon">⬆</span> Upload
          </a>
          <a routerLink="/jobs"   routerLinkActive="active" class="nav-item">
            <span class="nav-icon">📋</span> Jobs
          </a>
          <a routerLink="/keys"   routerLinkActive="active" class="nav-item">
            <span class="nav-icon">🔑</span> API Keys
          </a>
        </div>

        <div class="sidebar-footer">
          <button class="nav-item logout-btn" (click)="logout()">
            <span class="nav-icon">↩</span> Sign out
          </button>
        </div>
      </nav>

      <!-- Main content -->
      <main class="main-content">
        <router-outlet />
      </main>

      <!-- Toast overlay -->
      <div class="toast-container">
        @for (toast of toastService.toasts(); track toast.id) {
          <div class="toast toast-{{ toast.type }}">
            <span class="toast-icon">{{ toastIcon(toast) }}</span>
            <span class="toast-msg">{{ toast.message }}</span>
            <button class="toast-close" (click)="toastService.dismiss(toast.id)">✕</button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    /* Layout */
    .shell         { display: flex; height: 100vh; overflow: hidden; background: #f3f4f6; }

    /* Sidebar */
    .sidebar       { width: 220px; min-width: 220px; background: #1e1b4b; display: flex; flex-direction: column; padding: 0; }
    .sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 20px 18px 16px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .brand-icon    { font-size: 22px; }
    .brand-name    { color: #fff; font-size: 15px; font-weight: 700; letter-spacing: .05em; }
    .nav-section   { flex: 1; padding: 12px 10px; display: flex; flex-direction: column; gap: 2px; }
    .nav-item      { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; color: rgba(255,255,255,.65); font-size: 13px; font-weight: 500; text-decoration: none; cursor: pointer; border: none; background: transparent; width: 100%; transition: background .15s, color .15s; }
    .nav-item:hover, .nav-item.active { background: rgba(255,255,255,.1); color: #fff; }
    .nav-icon      { width: 20px; text-align: center; font-size: 15px; }
    .sidebar-footer { padding: 12px 10px; border-top: 1px solid rgba(255,255,255,.08); }
    .logout-btn    { color: rgba(255,255,255,.5) !important; font-size: 12px !important; }
    .logout-btn:hover { color: rgba(255,255,255,.9) !important; }

    /* Main content area */
    .main-content  { flex: 1; overflow-y: auto; }

    /* Toasts */
    .toast-container { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 10px; z-index: 9999; max-width: 360px; }
    .toast           { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,.15); background: #fff; font-size: 13px; animation: slide-in .2s ease-out; }
    .toast-success { border-left: 4px solid #10b981; }
    .toast-error   { border-left: 4px solid #ef4444; }
    .toast-warning { border-left: 4px solid #f59e0b; }
    .toast-info    { border-left: 4px solid #6366f1; }
    .toast-icon    { font-size: 16px; line-height: 1.4; }
    .toast-msg     { flex: 1; color: #111827; line-height: 1.4; }
    .toast-close   { background: transparent; border: none; color: #9ca3af; cursor: pointer; font-size: 12px; padding: 0; line-height: 1; }
    .toast-close:hover { color: #374151; }
    @keyframes slide-in { from { transform: translateX(20px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
  `],
})
export class ShellComponent {
  private auth = inject(AuthService);
  readonly toastService = inject(ToastService);

  logout(): void {
    this.auth.logout();
  }

  toastIcon(toast: Toast): string {
    const icons: Record<Toast['type'], string> = {
      success: '✅',
      error:   '❌',
      warning: '⚠️',
      info:    'ℹ️',
    };
    return icons[toast.type];
  }
}
