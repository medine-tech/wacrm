# State Management

## Zustand Conventions

- One store per domain (authStore, cartStore, uiStore)
- Use selectors to avoid unnecessary re-renders
- Keep stores flat — avoid deeply nested state

## React Query Integration

- Use React Query for all server state
- Zustand only for client-only state (UI preferences, form drafts)
- Never duplicate server data in Zustand stores
