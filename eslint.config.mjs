import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const sharedTypeAwareRules = {
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/no-floating-promises': ['error', { ignoreIIFE: true }],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
  ],
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
  'react-refresh/only-export-components': 'warn'
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'pnpm-lock.yaml'
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type']
    }
  },
  {
    files: ['api/src/**/*.ts', 'api/test/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./api/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.node
      }
    },
    rules: sharedTypeAwareRules
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./web/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.browser
      }
    },
    rules: sharedTypeAwareRules
  },
  {
    files: ['**/*.{spec,test}.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off'
    }
  }
);
