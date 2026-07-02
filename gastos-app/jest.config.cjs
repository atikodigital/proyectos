module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom', '<rootDir>/tests/setup.cjs'],
  testMatch: ['**/tests/**/*.test.{js,jsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss)$': '<rootDir>/tests/styleMock.cjs',
  },
  transform: { '^.+\\.(js|jsx)$': 'babel-jest' },
  transformIgnorePatterns: ['/node_modules/(?!(lucide-react)/)'],
};
