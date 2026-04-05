import { normalisePhone, parseTags, parseBoolean, normaliseRow } from '../../services/NormaliserService';

describe('NormaliserService', () => {
  describe('normalisePhone()', () => {
    it('should normalise 10-digit Indian numbers by prepending +91', () => {
      expect(normalisePhone('9876543210')).toBe('+919876543210');
    });

    it('should handle Indian numbers with leading 0', () => {
      expect(normalisePhone('09876543210')).toBe('+919876543210');
    });

    it('should handle Indian numbers already prefixed with 91', () => {
      expect(normalisePhone('919876543210')).toBe('+919876543210');
    });

    it('should handle numbers already in E.164 format', () => {
      expect(normalisePhone('+919876543210')).toBe('+919876543210');
      expect(normalisePhone('+15550000000')).toBe('+15550000000');
    });

    it('should handle spaces and special characters', () => {
      expect(normalisePhone('98765 43210')).toBe('+919876543210');
      expect(normalisePhone('(+91) 98765-43210')).toBe('+919876543210');
    });

    it('should return null for invalid or too short numbers', () => {
      expect(normalisePhone('12345')).toBeNull();
      expect(normalisePhone('')).toBeNull();
      expect(normalisePhone('abc')).toBeNull();
    });
  });

  describe('parseTags()', () => {
    it('should parse comma-separated tags', () => {
      expect(parseTags('tag1,tag2, tag3')).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse semicolon-separated tags', () => {
      expect(parseTags('tag1;tag2;tag3')).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse pipe-separated tags', () => {
      expect(parseTags('tag1|tag2|tag3')).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle mixed delimiters and whitespace', () => {
      expect(parseTags('Tag1; Tag2 | tag3, tag4')).toEqual(['tag1', 'tag2', 'tag3', 'tag4']);
    });

    it('should return an empty array for empty input', () => {
      expect(parseTags('')).toEqual([]);
      expect(parseTags('   ')).toEqual([]);
    });
  });

  describe('parseBoolean()', () => {
    it('should return true for truthy values', () => {
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean('yes')).toBe(true);
      expect(parseBoolean('1')).toBe(true);
      expect(parseBoolean('Y')).toBe(true);
    });

    it('should return false for falsy values', () => {
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean('no')).toBe(false);
      expect(parseBoolean('0')).toBe(false);
      expect(parseBoolean('')).toBe(false);
    });

    it('should return undefined for unknown values', () => {
      expect(parseBoolean('maybe')).toBeUndefined();
      expect(parseBoolean('unknown')).toBeUndefined();
    });
  });

  describe('normaliseRow()', () => {
    const fieldMapping = {
      'Mobile': 'phone' as const,
      'Email ID': 'email' as const,
      'Full Name': 'name' as const,
      'Category': 'tags' as const,
      'Is Premium': 'skip' as const,
    };
    const segment = 'test-segment';
    const batchId = 'job-123';

    it('should correctly map and normalise a row', () => {
      const row = {
        'Mobile': '9876543210',
        'Email ID': 'test@example.com',
        'Full Name': 'John Doe',
        'Category': 'premium,active',
        'Is Premium': 'Yes',
        'Extra Field': 'Something',
      };

      const result = normaliseRow(row, fieldMapping, segment, batchId);

      expect(result.contact).toEqual({
        phone: '+919876543210',
        email: 'test@example.com',
        name: 'John Doe',
        tags: ['premium', 'active'],
        segment: 'test-segment',
        source_batch_id: 'job-123',
        custom: {
          'Is Premium': 'Yes',
          'Extra Field': 'Something',
        },
      });
      expect(result.error).toBeUndefined();
    });

    it('should return an error for missing phone number', () => {
      const row = { 'Email ID': 'test@example.com' };
      const result = normaliseRow(row, fieldMapping, segment, batchId);
      expect(result.contact).toBeNull();
      expect(result.error).toBe('Missing phone number');
    });

    it('should return an error for invalid phone number', () => {
      const row = { 'Mobile': 'invalid' };
      const result = normaliseRow(row, fieldMapping, segment, batchId);
      expect(result.contact).toBeNull();
      expect(result.error).toBe('Invalid phone number: invalid');
    });
  });
});
