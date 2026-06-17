module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  transform: { '^.+\\.(js|jsx)$': 'babel-jest' },
  moduleNameMapper: { '\\.(css)$': '<rootDir>/tests/styleMock.cjs' },
  testMatch: ['<rootDir>/tests/**/*.test.{js,jsx}'],
};
