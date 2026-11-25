/**
 * Root compatibility entrypoint. Bootstrap sets cwd and loads .env before app imports.
 */
await import('./apps/api/bootstrap.ts');
