// server/services/requestContext.js
//
// A small per-request store (AsyncLocalStorage), so code deep in a request - the
// Cash / Bank ledger helpers - can leave a note for the response layer without
// every controller having to pass it along. Used by the period lock: a
// PeriodClosedError raised by the ledger is remembered here, and
// middleware/periodGuard.js turns a generic 500 into the real 409 even when a
// controller's own catch-all swallowed the error.
const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

/** Runs `work` with a fresh store; everything it starts (awaits, callbacks) sees that store. */
const runWithStore = (work) => storage.run({}, work);

/** The current request's store, or undefined outside a request (tests, background jobs). */
const currentStore = () => storage.getStore();

module.exports = { runWithStore, currentStore };
