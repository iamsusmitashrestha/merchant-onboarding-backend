// Unit and e2e tests in one run, so coverage counts code exercised by either.
module.exports = {
  projects: ['<rootDir>', '<rootDir>/test/jest-e2e.json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/database/migrations/**',
    '!src/database/seeds/**',
    '!src/database/data-source.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],
  // CI fails if coverage drops below these (it was 98/98/97/80 when set).
  coverageThreshold: {
    global: { statements: 95, lines: 95, functions: 95, branches: 75 },
  },
};
