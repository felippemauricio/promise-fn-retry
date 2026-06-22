import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '_site'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Browser demo (plain JS running in the page).
    files: ['demo/browser/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        console: 'readonly',
        AbortController: 'readonly',
      },
    },
  },
  {
    // Node demos and the local dev server.
    files: ['demo/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
