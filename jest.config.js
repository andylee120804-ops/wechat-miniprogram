/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // Unit tests configuration
  testMatch: ['**/tests/unit/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  setupFilesAfterEnv: ['<rootDir>/tests/unit/setup.js']
}
