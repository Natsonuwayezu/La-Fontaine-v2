/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/**/*-tests.js'],
    setupFiles: ['fake-indexeddb/auto'],
    verbose: true,
};
