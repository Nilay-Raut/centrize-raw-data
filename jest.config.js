module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }]
  },
  roots: ['<rootDir>/src/test'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/test/**/*.ts',
    '!src/server.ts',
    '!src/db/migrate.ts',
    '!src/types/**/*.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true
};
