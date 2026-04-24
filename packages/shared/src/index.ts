export * from './money.js';
export * from './week-iso.js';
export * from './result.js';
export * from './clock.js';
export * from './avs.js';
export * from './iban.js';
export * from './canton.js';
export * from './name.js';
export * from './email.js';
export * from './phone.js';
export * from './magic-bytes.js';
export * from './ide.js';

// `observability/prom-registry` n'est PAS ré-exporté ici parce qu'il dépend
// de `prom-client` (Node-only : utilise `cluster`, `v8`, `process.uptime()`).
// Les client components Next.js qui importent depuis `@interim/shared`
// (ex: `import { CANTONS } from '@interim/shared'`) ne tirent donc pas
// prom-client dans leur bundle browser → plus de crash hydration React
// (cf. PR fix/web-admin-prom-client-bundle).
//
// Pour utiliser le registre côté server uniquement (API + worker), importer
// via le sub-path explicite :
//   import { createPromRegistry, hashAgencyId } from '@interim/shared/observability/prom-registry';
