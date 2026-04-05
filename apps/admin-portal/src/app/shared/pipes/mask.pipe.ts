import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'mask',
  standalone: true,
})
export class MaskPipe implements PipeTransform {
  transform(value: string | undefined | null, type: 'phone' | 'email'): string {
    if (!value) return '—';

    if (type === 'phone') {
      return this.maskPhone(value);
    } else if (type === 'email') {
      return this.maskEmail(value);
    }

    return value;
  }

  private maskPhone(phone: string): string {
    // E.164: +919876543210
    // Keep prefix (+) and first 5 chars (usually +9198) and last 4 chars
    if (phone.length <= 8) return phone;
    
    const prefix = phone.slice(0, 5);
    const suffix = phone.slice(-4);
    const maskedLen = phone.length - 5 - 4;
    const masked = '*'.repeat(Math.max(4, maskedLen));
    
    return `${prefix}${masked}${suffix}`;
  }

  private maskEmail(email: string): string {
    // john.doe@example.com -> jo****oe@example.com
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;

    if (local.length <= 4) {
      return `${local[0]}***${local.slice(-1)}@${domain}`;
    }

    const prefix = local.slice(0, 2);
    const suffix = local.slice(-2);
    return `${prefix}****${suffix}@${domain}`;
  }
}
