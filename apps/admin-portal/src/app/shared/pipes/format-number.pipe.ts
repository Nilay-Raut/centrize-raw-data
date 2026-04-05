/**
 * FormatNumberPipe — renders numbers in Indian locale format.
 * e.g. 150000 → "1,50,000"
 * Pure pipe — no re-computation unless value changes.
 */
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'formatNumber', standalone: true, pure: true })
export class FormatNumberPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '0';
    return value.toLocaleString('en-IN');
  }
}
