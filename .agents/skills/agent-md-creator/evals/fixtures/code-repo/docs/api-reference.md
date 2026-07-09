# API Reference

## Endpoints

### GET /api/tasks
Returns all tasks for the authenticated user.

### POST /api/tasks
Creates a new task. Body must include `title` and `priority`.

### DELETE /api/tasks/:id
Soft-deletes a task by ID.

## Authentication
All endpoints require a Bearer token in the Authorization header.
