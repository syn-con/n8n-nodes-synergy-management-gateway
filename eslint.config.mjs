// The full n8n ruleset, the one the community-package scanner applies before a node can be verified.
// No rule is switched off: every exception the 1.x package carried is resolved in the code instead.
// The tests are left out because they are not part of the package (`files` ships `dist` alone) and they
// import vitest, which the ruleset rightly refuses in anything n8n would load.
import { config } from '@n8n/node-cli/eslint';

export default [{ ignores: ['test/**', 'vitest.config.ts'] }, ...config];
