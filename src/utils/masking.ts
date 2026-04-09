
/**
 * Masking Utility — Protect PII at the server level.
 */

/**
 * Mask a phone number, leaving only the first 3 (country code) and last 4 digits visible.
 * Example: +919876543210 -> +91 ******3210
 */
export function maskPhone(phone: string): string {
  if (!phone) return '';
  if (phone.length <= 7) return '********'; // Too short to mask safely

  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-4);
  const maskedLength = phone.length - 7;
  const masks = '*'.repeat(Math.max(4, maskedLength));
  
  return `${prefix} ${masks}${suffix}`;
}

/**
 * Mask an email address, leaving only the first 2 chars of the username and the domain visible.
 * Example: nilay.raut@centrize.com -> ni***@centrize.com
 */
export function maskEmail(email: string): string {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';

  const [user, domain] = parts;
  if (!user || user.length <= 2) return `**@${domain}`;

  const maskedUser = user.slice(0, 2) + '***';
  return `${maskedUser}@${domain}`;
}
