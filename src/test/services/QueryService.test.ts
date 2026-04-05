/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { queryService } from '../../services/QueryService';
import { queryContacts, countContacts } from '../../db/queries/contacts';
import { LIMITS, DEFAULT_PAGE_SIZE } from '../../config/limits';
import { ValidationError } from '../../types/errors';

jest.mock('../../db/queries/contacts', () => ({
  queryContacts: jest.fn(),
  countContacts: jest.fn(),
}));

describe('QueryService', () => {
  const mockQueryContacts = queryContacts as jest.Mock;
  const mockCountContacts = countContacts as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('query()', () => {
    it('should correctly cap page_size based on platform limits', async () => {
      const payload = {
        filters: { segment: 'test' },
        page_size: 5000,
      };
      
      mockQueryContacts.mockResolvedValue({ rows: [], nextCursor: null });
      mockCountContacts.mockResolvedValue(0);

      const result = await queryService.query(payload, 'whatsapp');

      // WhatsApp maxPageSize is 1000
      expect(result.page_size).toBe(LIMITS['whatsapp'].maxPageSize);
      expect(mockQueryContacts).toHaveBeenCalledWith(
        payload.filters,
        LIMITS['whatsapp'].maxPageSize,
        null,
        expect.any(Array)
      );
    });

    it('should use DEFAULT_PAGE_SIZE if no page_size is provided', async () => {
      const payload = {
        filters: { segment: 'test' },
      };
      
      mockQueryContacts.mockResolvedValue({ rows: [], nextCursor: null });
      mockCountContacts.mockResolvedValue(0);

      const result = await queryService.query(payload, 'admin');

      expect(result.page_size).toBe(DEFAULT_PAGE_SIZE);
    });

    it('should throw ValidationError for unknown platform', async () => {
      const payload = { filters: {} };
      await expect(queryService.query(payload, 'invalid' as any))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if page_size < 1', async () => {
      const payload = { filters: {}, page_size: 0 };
      await expect(queryService.query(payload, 'whatsapp'))
        .rejects.toThrow('page_size must be at least 1');
    });

    it('should return query results correctly', async () => {
      const payload = {
        filters: { segment: 'test' },
        page_size: 10,
        cursor: 'base64cursor',
        fields: ['id', 'phone'] as any,
      };
      
      const mockRows = [{ id: '1', phone: '+919876543210' }];
      mockQueryContacts.mockResolvedValue({ rows: mockRows, nextCursor: 'next' });
      mockCountContacts.mockResolvedValue(100);

      const result = await queryService.query(payload, 'whatsapp');

      expect(result).toEqual({
        data: mockRows,
        next_cursor: 'next',
        total_count: 100,
        page_size: 10,
      });
      
      expect(mockQueryContacts).toHaveBeenCalledWith(
        payload.filters,
        10,
        'base64cursor',
        ['id', 'phone']
      );
    });
  });
});
