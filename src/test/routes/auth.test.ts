/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, no-console, @typescript-eslint/no-explicit-any */
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../app';
import db from '../../db/knex';

describe('Auth Integration', () => {
  const email = 'admin@example.com';
  const password = 'Password@123';

  beforeAll(async () => {
    // Ensure we have an admin user for testing
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Cleanup any existing test user
    await db('admin_users').where({ email }).delete();
    
    await db('admin_users').insert({
      id: '00000000-0000-0000-0000-000000000001',
      email,
      password_hash: passwordHash,
    });
  });

  afterAll(async () => {
    await db('admin_users').where({ email }).delete();
    await db.destroy();
  });

  describe('Diagnostics', () => {
    it('should return 200 for /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 200 and a JWT for valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
    });

    it('should return 401 for invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});
