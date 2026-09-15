import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    target: 'node20',
    sourcemap: true,
    clean: true,
    onSuccess: 'tsc --emitDeclarationOnly',
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node20',
    banner: {
      js: '#!/usr/bin/env node',
    },
    sourcemap: true,
  },
]);
