# Frontend Architecture

This directory contains the frontend application code.

## Component Guidelines

- Use functional components with hooks
- Keep components under 200 lines
- Extract reusable logic into custom hooks

## Documentation

**IMPORTANT**: Before modifying React components, read the relevant documents in `docs/`.
To identify which files are relevant, run `ls` in that directory and base your decision on the file names.

## State Management

We use Zustand for global state. Each store is in `stores/`.
To see available stores, run `ls stores/` and read the relevant file.

## Testing

All components must have tests. Run `npm test` to execute the test suite.
