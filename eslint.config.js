import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.claude', '.fabric'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow `const { secret, ...rest } = obj` to drop fields, and `_`-prefixed unused params.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['backend/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
