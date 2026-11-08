/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15000,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/cli/index.ts'],
  coverageDirectory: 'coverage',
};
