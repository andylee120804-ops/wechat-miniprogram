/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testRegex: 'tests/e2e/.*\\.spec\\.js$',
  testTimeout: 60000,
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
}
