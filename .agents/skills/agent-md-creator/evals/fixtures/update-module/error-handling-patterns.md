---
id: error-handling-patterns
title: "Error Handling Patterns"
type: lesson
source:
  course: backend-mastery
  module: api-design-patterns
  instructor: "Carlos Mendoza"
domain: [backend, api-design]
tags: [error-handling, http-status-codes, problem-details, validation-errors]
created_at: 2025-10-12
---

# Error Handling Patterns

## Overall Summary

This lesson covers structured error handling in REST APIs, including proper HTTP status code usage, the RFC 7807 Problem Details format, and strategies for validation error reporting that help API consumers fix issues quickly.

## Key Points

- Use specific HTTP status codes — 400 for validation, 404 for not found, 409 for conflicts, 422 for semantic errors
- Adopt RFC 7807 Problem Details for consistent error response structure
- Validation errors should reference the specific field and provide actionable messages
- Internal errors (5xx) should never expose stack traces or implementation details
- Error codes (machine-readable) complement error messages (human-readable)

## Detailed Notes

### RFC 7807 Problem Details Format

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "The request body contains invalid fields",
  "instance": "/orders/123",
  "errors": [
    { "field": "quantity", "message": "Must be a positive integer" }
  ]
}
```
