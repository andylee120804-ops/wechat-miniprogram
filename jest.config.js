/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.js', '**/tests/e2e/**/*.spec.js'],
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/'],
  testTimeout: 120000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees'],
}
