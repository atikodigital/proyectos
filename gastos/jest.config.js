module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  moduleNameMapper: {
    '^pg-mem$': '<rootDir>/pg-mem-patched.js',
  },
};
