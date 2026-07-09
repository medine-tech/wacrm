# Testing Guide

## React Testing Library

- Test behavior, not implementation details
- Use `screen.getByRole` over `getByTestId` when possible
- Mock API calls with MSW (Mock Service Worker)

## Test File Naming

- Co-locate tests: `Button.tsx` -> `Button.test.tsx`
- Integration tests go in `__tests__/` directories

## Coverage Requirements

- Minimum 80% line coverage for new code
- Critical paths (auth, payments) require 95% coverage
