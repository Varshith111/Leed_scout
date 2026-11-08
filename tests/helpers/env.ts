/** Builds a minimal, valid environment for tests. */
export function createTestEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/leadscout_test',
    LOG_TO_FILE: 'false',
    ...overrides,
  };
}
