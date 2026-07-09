---
id: api-versioning
title: "API Versioning"
type: lesson
source:
  course: backend-mastery
  module: api-design-patterns
  instructor: "Carlos Mendoza"
domain: [backend, api-design]
tags: [api-versioning, url-versioning, header-versioning, breaking-changes, deprecation]
created_at: 2025-10-15
---

# API Versioning

## Overall Summary

This lesson examines API versioning strategies — URL path versioning, header-based versioning, and query parameter versioning — along with deprecation workflows and migration guides for API consumers.

## Key Points

- URL versioning (/v1/users) is the most explicit and discoverable approach
- Header versioning (Accept: application/vnd.api.v2+json) keeps URLs clean but is less discoverable
- Breaking changes require a new version — additive changes do not
- Deprecation should include sunset headers, migration guides, and a minimum 6-month notice
- Never remove a version without confirming zero active consumers

## Detailed Notes

### When to Version

A new version is needed when:
- Removing a field or endpoint
- Changing a field's type or semantics
- Restructuring response format

A new version is NOT needed when:
- Adding new optional fields
- Adding new endpoints
- Fixing bugs in existing behavior
