/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/**/*-tests.js'],
    setupFiles: ['./tests/helpers/jsdom-polyfills.js', 'fake-indexeddb/auto'],
    verbose: true,
};
