/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testRegex: '.*\\.test\\.js$',
  testTimeout: 30000,
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/', '/fixtures/', '/e2e/'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  setupFilesAfterEnv: ['<rootDir>/tests/unit/setup.js'],
  modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
  // Transform node_modules that need transformation
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid)/)'
  ],
  rootDir: '../../'
}
