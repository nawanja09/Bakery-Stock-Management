// server/utils/safeError.js
//
// What a 500 response may tell the client (audit finding R9b).
//
// `'Server error: ' + error.message` sent raw MySQL text to the browser - table names,
// column names, even fragments of the failing SQL. Unexpected errors now answer with
// a fixed message and keep the detail in the server log.
//
// An error whose text is meant for the user is thrown as a ClientError (with the HTTP
// status it deserves) and is passed through unchanged.
class ClientError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ClientError';
    this.status = status;
    this.expose = true;
  }
}

const GENERIC_MESSAGE = 'Server error';

/**
 * Sends the response for an error caught by a controller.
 * @param {object} res    Express response
 * @param {Error}  error  the caught error
 * @param {string} [context] short label for the log line
 */
const sendServerError = (res, error, context = 'Request failed') => {
  if (error && error.expose === true) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  console.error(`${context}:`, error);
  return res.status(500).json({ error: GENERIC_MESSAGE });
};

module.exports = { ClientError, sendServerError, GENERIC_MESSAGE };
