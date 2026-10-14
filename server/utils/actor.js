// server/utils/actor.js
//
// The user who performs a request - ALWAYS the authenticated user from the
// verified token (middleware/authenticate.js), never a created_by / prepared_by
// value sent by the client: those let anyone record a payment, transfer or
// invoice in someone else's name.
//
// Returns the positive integer user id, or null when the request is not
// authenticated (callers keep their own "required" error handling).
const actorId = (req) => {
  const id = Number(req?.user?.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
};

module.exports = { actorId };
