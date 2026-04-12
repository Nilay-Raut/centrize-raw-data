/**
 * LoginComponent — email + password login form.
 *
 * Flow:
 *   User submits → AuthService.login() → POST /api/auth/login
 *   → JWT stored in sessionStorage → navigate to /query
 *
 * FRONTEND.md §11
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  NgZone,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1>Campaign Data Platform</h1>
          <p>Sign in to continue</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="login-form" novalidate>
          <!-- Email -->
          <div class="field">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              placeholder="admin@example.com"
              autocomplete="email"
              [class.input-error]="emailInvalid()"
            />
            @if (emailInvalid()) {
              <span class="field-error">Enter a valid email address.</span>
            }
          </div>

          <!-- Password -->
          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              placeholder="••••••••"
              autocomplete="current-password"
              [class.input-error]="passwordInvalid()"
            />
            @if (passwordInvalid()) {
              <span class="field-error">Password is required.</span>
            }
          </div>

          <!-- API Key (optional — required for upload/query/export) -->
          <div class="field">
            <label for="apiKey">
              API Key
              <span class="field-hint">optional — needed for upload, query &amp; export</span>
            </label>
            <input
              id="apiKey"
              type="password"
              formControlName="apiKey"
              placeholder="cdp_••••••••"
              autocomplete="off"
            />
          </div>

          <!-- Server error -->
          @if (serverError()) {
            <div class="server-error">{{ serverError() }}</div>
          }

          <!-- Submit -->
          <button type="submit" class="btn-primary" [disabled]="loading()">
            {{ loading() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-page  { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f3f4f6; }
    .login-card  { width: 100%; max-width: 400px; background: #fff; border-radius: 12px; padding: 40px 32px; box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 4px 16px rgba(0,0,0,.06); }
    .login-header h1  { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: #111827; }
    .login-header p   { margin: 0 0 28px; font-size: 14px; color: #6b7280; }
    .login-form  { display: flex; flex-direction: column; gap: 18px; }
    .field       { display: flex; flex-direction: column; gap: 6px; }
    label        { font-size: 13px; font-weight: 500; color: #374151; }
    input        { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; transition: border-color .15s; }
    input:focus  { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.12); }
    .input-error { border-color: #ef4444 !important; }
    .field-error { font-size: 12px; color: #ef4444; }
    .field-hint  { font-size: 11px; color: #9ca3af; font-weight: 400; margin-left: 6px; }
    .server-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 10px 12px; border-radius: 8px; font-size: 13px; }
    .btn-primary  { padding: 11px; background: #6366f1; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .15s; }
    .btn-primary:hover:not(:disabled) { background: #4f46e5; }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
  `],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private zone = inject(NgZone);

  loading = signal(false);
  serverError = signal('');

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    apiKey: [''],  // optional — stored in sessionStorage for X-Api-Key header
  });

  emailInvalid = (): boolean => this.form.controls.email.invalid && this.form.controls.email.touched;
  passwordInvalid = (): boolean => this.form.controls.password.invalid && this.form.controls.password.touched;

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.serverError.set('');

    const { email, password, apiKey } = this.form.getRawValue();

    this.auth.login({ email, password, apiKey: apiKey?.trim() || undefined }).subscribe({
      next: () => {
        this.zone.run(() => {
          if (apiKey?.trim()) this.auth.setApiKey(apiKey.trim());
          this.loading.set(false);
          this.toast.success('Signed in successfully.');
          this.router.navigate(['/insights']);
        });
      },
      error: (err: { status?: number }) => {
        this.zone.run(() => {
          this.loading.set(false);
          this.serverError.set(
            err.status === 401
              ? 'Invalid email or password.'
              : 'Login failed. Please try again.',
          );
        });
      },
    });
  }
}
