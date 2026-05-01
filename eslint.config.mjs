import tseslint from 'typescript-eslint';
import next from '@next/eslint-plugin-next';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      '.output/**',
    ],
  },
  ...tseslint.configs.recommended,
  next.configs['core-web-vitals'],
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      curly: 'warn',
      'no-debugger': 'warn',
    },
  },
  prettierConfig,
];
