/** Builds a minimal, valid environment for tests. */
export function createTestEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://root:secret@localhost:3306/leadscout_test',
    LOG_TO_FILE: 'false',
    ...overrides,
  };
}
