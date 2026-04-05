/**
 * ToastService — lightweight signal-based notification service.
 * Toasts auto-dismiss after 5 s. ShellComponent renders them.
 */
import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  success(message: string): void { this._show('success', message); }
  error(message: string): void   { this._show('error',   message); }
  warning(message: string): void { this._show('warning', message); }
  info(message: string): void    { this._show('info',    message); }

  dismiss(id: string): void {
    this._toasts.update((ts) => ts.filter((t) => t.id !== id));
  }

  private _show(type: Toast['type'], message: string): void {
    const id = crypto.randomUUID();
    this._toasts.update((ts) => [...ts, { id, type, message }]);
    setTimeout(() => this.dismiss(id), 5000);
  }
}
