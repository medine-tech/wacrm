import { Hono } from 'hono';
import { taskRoutes } from './routes/tasks';
import { authMiddleware } from './middleware/auth';

const app = new Hono();

app.use('/api/*', authMiddleware);
app.route('/api/tasks', taskRoutes);

export default app;
