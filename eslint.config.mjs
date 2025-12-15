// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist', 'node_modules', 'coverage'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      // Prevent Number() arithmetic on monetary values
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name="Number"][arguments.0.type="MemberExpression"][arguments.0.property.name=/^(subtotal|total|amount|price|unitPrice|tax|creditsApplied|quantity|value)$/]',
          message:
            'Use Money or Quantity utilities from @/common/types instead of Number() for monetary/quantity calculations to prevent floating-point precision errors',
        },
        {
          selector:
            'BinaryExpression[operator="+"]:has(MemberExpression[property.name=/^(subtotal|total|amount|price|unitPrice|tax|creditsApplied)$/])',
          message:
            'Use Money.add() instead of + operator on monetary values to prevent floating-point precision errors',
        },
        {
          selector:
            'BinaryExpression[operator="-"]:has(MemberExpression[property.name=/^(subtotal|total|amount|price|unitPrice|tax|creditsApplied)$/])',
          message:
            'Use Money.subtract() instead of - operator on monetary values to prevent floating-point precision errors',
        },
        {
          selector:
            'BinaryExpression[operator="*"]:has(MemberExpression[property.name=/^(subtotal|total|amount|price|unitPrice|tax|creditsApplied)$/])',
          message:
            'Use Money.multiply() instead of * operator on monetary values to prevent floating-point precision errors',
        },
        {
          selector:
            'BinaryExpression[operator="/"]:has(MemberExpression[property.name=/^(subtotal|total|amount|price|unitPrice|tax|creditsApplied)$/])',
          message:
            'Use Money.divide() instead of / operator on monetary values to prevent floating-point precision errors',
        },
      ],
    },
  },
);

