/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, no-console */
import request from 'supertest';
import express from 'express';

const testApp = express();
testApp.get('/health', (req, res) => res.json({ ok: true }));

describe('Simple Express Test', () => {
  it('should return 200 for /health', async () => {
    const res = await request(testApp).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
