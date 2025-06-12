/**
 * ESLint configuration – flat config format (ESLint v9+)
 * Migrated from .eslintrc.cjs to the new flat config system.
 *
 * The config intentionally stays small: the goal is to catch *actual*
 * issues (undefined variables, suspicious awaits, etc.) without being
 * overly pedantic when it comes to stylistic concerns. Formatting is
 * handled by Prettier.
 */

const globals = require('globals');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const js = require('@eslint/js');
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = [
  // Ignore patterns (replaces .eslintignore)
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/*.min.js', 'data/**'],
  },

  // Base configuration for JavaScript files
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    ...js.configs.recommended,
    ...compat.extends('prettier')[0],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Catch accidental constant conditions but allow intentional ones in
      // scripts (while/for `while (true)` loops). Emit as *warning* so CI does
      // not fail.
      'no-constant-condition': 'warn',
    },
  },

  // TypeScript-specific configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    ...compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier'
    )[0],
    rules: {
      // Disable base eslint no-unused-vars in favor of TypeScript version
      'no-unused-vars': 'off',
      // Example: allow unused variables starting with _ (common for ignored params)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      // The PlayCanvas & experimental prototyping code uses `any` in a few
      // places where strict typing would be overkill. We track those spots
      // separately and therefore disable the explicit-`any` rule here.
      '@typescript-eslint/no-explicit-any': 'off',
      // Catch accidental constant conditions but allow intentional ones in
      // scripts (while/for `while (true)` loops). Emit as *warning* so CI does
      // not fail.
      'no-constant-condition': 'warn',
    },
  },
];
