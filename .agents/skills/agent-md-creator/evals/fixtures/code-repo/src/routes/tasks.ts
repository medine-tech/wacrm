import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { tasks } from '../db/schema';

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().datetime().optional(),
});

export const taskRoutes = new Hono()
  .get('/', async (c) => {
    const allTasks = await db.select().from(tasks);
    return c.json(allTasks);
  })
  .post('/', async (c) => {
    const body = createTaskSchema.parse(await c.req.json());
    const newTask = await db.insert(tasks).values(body).returning();
    return c.json(newTask[0], 201);
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    await db.delete(tasks).where(eq(tasks.id, id));
    return c.json({ deleted: true });
  });
