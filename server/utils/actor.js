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

// The signed-in user's display name (users.name, else username), or null.
const actorName = async (queryable, req) => {
  const id = actorId(req);
  if (!id) return null;
  const [rows] = await queryable.query('SELECT name, username FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0]?.name || rows[0]?.username || null;
};

// "Approved By" on Issue, Wastage and Stock Adjustment notes: the approver's
// name only when the form names one (often someone without a login), otherwise
// the signed-in user who makes the record.
const approverName = async (queryable, req, typed) => {
  const name = String(typed ?? '').trim();
  return name ? name.slice(0, 255) : actorName(queryable, req);
};

module.exports = { actorId, actorName, approverName };
