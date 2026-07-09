import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Task API', () => {
  it('GET /api/tasks returns 401 without auth', async () => {
    const res = await app.request('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('POST /api/tasks creates a task', async () => {
    const res = await app.request('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        title: 'Test task',
        priority: 'medium',
      }),
    });
    expect(res.status).toBe(201);
  });
});
