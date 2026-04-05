/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, no-console */
import request from 'supertest';
import app from '../app';
import db from '../db/knex';
import redis from '../db/redis';

describe('Real App Health Check', () => {
  afterAll(async () => {
    await db.destroy();
    await redis.quit();
  });

  it('should return 200 for /health', async () => {
    const res = await request(app).get('/health');
    console.log('Health check response:', res.status, res.body);
    expect(res.status).toBe(200);
  });
});
