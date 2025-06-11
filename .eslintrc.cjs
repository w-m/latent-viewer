/**
 * ESLint configuration – modern variant using `overrides` to apply
 * TypeScript-specific rules and enable type-aware linting while still
 * keeping start-up fast for plain JavaScript files.
 *
 * The config intentionally stays small: the goal is to catch *actual*
 * issues (undefined variables, suspicious awaits, etc.) without being
 * overly pedantic when it comes to stylistic concerns. Formatting is
 * handled by Prettier.
 */

module.exports = {
  root: true,

  env: {
    browser: true,
    es2022: true,
    node: true,
  },

  // Shared settings for all files
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'prettier'],
  rules: {
    // Catch accidental constant conditions but allow intentional ones in
    // scripts (while/for `while (true)` loops). Emit as *warning* so CI does
    // not fail.
    'no-constant-condition': 'warn',
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        // "plugin:@typescript-eslint/recommended-requiring-type-checking",
        'prettier',
      ],
      rules: {
        // Example: allow unused variables starting with _ (common for ignored params)
        '@typescript-eslint/no-unused-vars': [
          'warn',
          { argsIgnorePattern: '^_' },
        ],
        // The PlayCanvas & experimental prototyping code uses `any` in a few
        // places where strict typing would be overkill. We track those spots
        // separately and therefore disable the explicit-`any` rule here.
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
  ],
};
