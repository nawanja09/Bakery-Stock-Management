// server/tests/helpers/noDatabase.js
//
// Require this FIRST in every unit test that must not touch MySQL:
//   require('./helpers/noDatabase');
//
// Loading the real config/db opens a connection pool to the database in .env
// (which keeps the test process from exiting) and runs the server's automatic
// schema changes against it. This replaces it with a stub that fails loudly if
// a unit test ever queries it - such a test belongs in tests/db/ (test database).
// A test that installs its own fake pool afterwards (require.cache) still wins.
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'config', 'db.js');
const refuse = (what) => () => Promise.reject(new Error(
  `${what} was called from a unit test - unit tests run without a database (tests/helpers/noDatabase.js). `
  + 'Pass a fake connection, or move the test to tests/db/.'
));

if (!require.cache[dbPath]) {
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: refuse('pool.query'),
      execute: refuse('pool.execute'),
      getConnection: refuse('pool.getConnection'),
      end: async () => {},
      collectionsSchemaReady: Promise.resolve(),
      cardCommissionSchemaReady: Promise.resolve()
    }
  };
}
