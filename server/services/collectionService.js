// server/services/collectionService.js
//
// Approve / Reject / Restore for Collection records. Every function takes an
// open transaction `connection` and never commits: the controller wraps each
// request in ONE database transaction, so an approval either saves the status,
// the collection_transactions lines AND every ledger row, or nothing at all.
//
// Approve (pending -> completed). Each payment method is posted on its own,
// through the EXISTING ledger helpers, and recorded as one collection_transactions
// line holding the id of the ledger row it created:
//   CASH          -> Cash Ledger DEBIT             (financeLedger.recordCashTransaction)
//   BANK / Online -> Bank Ledger DEBIT on the company's bank account
//                    (financeLedger.recordBankTransaction). The account comes from
//                    the POS when it sent a matching account number, otherwise the
//                    user picks it; it must be active and belong to the company.
//   CARD          -> Card Ledger: Pending card transactions (cardLedgerService.
//                    createPendingCardTransaction) - the unchanged Card Ledger
//                    process then realises them into the bank. The Card Ledger needs
//                    the settlement bank account, which the user picks.
//                    SHIFT: one Card Ledger row PER INDIVIDUAL POS CARD PAYMENT
//                    (card.transactions[]), never the shift's card total. Each keeps
//                    its own date, POS reference (receipt / order) and details, and
//                    is linked in collection_card_payments (UNIQUE POS key). The
//                    payments must add up to the card total, otherwise approval is
//                    refused - amounts are never split or balanced artificially.
//                    Credit payment by card: the payment itself is one row.
//   AR            -> "AR Account" Other Ledger DEBIT
//   AR_SETTLEMENT -> Credit Payment only: "AR Account" Other Ledger CREDIT of the
//                    money received (Cash + Card + Bank / Online) - the customer's
//                    outstanding AR is reduced by what they paid. Posted in the same
//                    transaction and under the same company as the Cash / Bank /
//                    Card debit, once per Credit Payment (UNIQUE lines below).
//   SHORT_EXCESS  -> "Short/Excess Account" Other Ledger: short DEBIT, excess CREDIT
//   Employee deduction -> "Short/Excess Account" CREDIT (shortage recovered),
//                    linked to the shift collection it settles.
//
// Idempotency / duplicates
//   * Rows are locked (FOR UPDATE) in id order; status is re-checked under the lock.
//   * Approving an already COMPLETED record is a no-op reported as `skipped`:
//     no new collection, line or ledger row is ever created for it.
//   * UNIQUE (collection_id, payment_method) on collection_transactions and
//     UNIQUE (source_type, source_id) on other_ledger_transactions make a second
//     posting impossible even under concurrency.
//   * A record whose POS reference was already completed under another POS id
//     is refused.
const { recordCashTransaction, recordBankTransaction } = require('../utils/financeLedger');
const { createPendingCardTransaction } = require('./cardLedgerService');
const ol = require('./otherLedgerService');
const { SOURCES, PAYMENT_METHODS, postingsOf, cardPaymentsOf, reconcileCard } = require('./collectionMapper');
const { HttpError } = require('../utils/staffLoanUtils');

const MAX_BATCH = 100;
const REASON_MAX = 255;
const REFERENCE_MAX = 100;
const REF_PREFIX = { [SOURCES.SHIFT]: 'SHIFT', [SOURCES.CREDIT_PAYMENT]: 'CP', [SOURCES.EMPLOYEE_DEDUCTION]: 'DED' };
const FINANCE_REFERENCE_TYPE = 'COLLECTION';

/** Reference stored on every ledger row: the original POS reference, e.g. "SHIFT-1042". */
const ledgerReference = (row) =>
  `${REF_PREFIX[row.source_type] || 'POS'}-${row.reference_no || row.source_id}`.slice(0, REFERENCE_MAX);

const label = (row) => ledgerReference(row);

const parseIds = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, 'Select at least one record');
  if (raw.length > MAX_BATCH) throw new HttpError(400, `You can process at most ${MAX_BATCH} records at a time`);
  const seen = new Set();
  const ids = raw.map((value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid collection id');
    if (seen.has(id)) throw new HttpError(400, 'The same record was selected more than once');
    seen.add(id);
    return id;
  });
  return ids.sort((a, b) => a - b); // fixed lock order: concurrent requests cannot deadlock
};

const optionalId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id in request');
  return id;
};

const lockCollection = async (connection, id) => {
  const [rows] = await connection.query(
    `SELECT id, source_type, source_id, reference_no, DATE_FORMAT(collection_date, '%Y-%m-%d') AS collection_date,
            shift_id, cashier_name, employee_name, company_id, pos_bank_account, pos_branch_name, department_id,
            cash_amount, card_amount, bank_amount, ar_amount, short_excess_amount, deduction_amount,
            total_amount, pos_total_amount, linked_collection_id, status, raw_payload
       FROM collections WHERE id = ? FOR UPDATE`,
    [id]
  );
  if (!rows.length) throw new HttpError(404, `Collection #${id} not found`);
  return rows[0];
};

// Active bank account that belongs to the company (same rule as Bank Receive).
const requireCompanyBank = async (connection, bankId, companyId, missingMessage) => {
  if (!bankId) throw new HttpError(400, missingMessage);
  const [rows] = await connection.query(
    `SELECT bd.id FROM bank_details bd
       INNER JOIN company c ON LOWER(TRIM(c.name)) = LOWER(TRIM(bd.company))
      WHERE bd.id = ? AND c.id = ? AND bd.status = 'Active' AND COALESCE(bd.record_status, 1) = 1`,
    [bankId, companyId]
  );
  if (!rows.length) throw new HttpError(400, 'The selected bank account is not an active account of the collection\'s company');
  return bankId;
};

// The company's active account whose number the POS sent (exactly one match), or null.
const bankFromPos = async (connection, posAccount, companyId) => {
  if (!posAccount) return null;
  const digits = String(posAccount).replace(/\D/g, '');
  if (!digits) return null;
  const [rows] = await connection.query(
    `SELECT bd.id FROM bank_details bd
       INNER JOIN company c ON LOWER(TRIM(c.name)) = LOWER(TRIM(bd.company))
      WHERE c.id = ? AND bd.status = 'Active' AND COALESCE(bd.record_status, 1) = 1
        AND REPLACE(REPLACE(bd.account_number, ' ', ''), '-', '') = ?`,
    [companyId, digits]
  );
  return rows.length === 1 ? rows[0].id : null;
};

const insertLine = async (connection, row, { method, amount, companyId, bankId = null, userId }) => {
  try {
    const [result] = await connection.query(
      `INSERT INTO collection_transactions
         (collection_id, transaction_date, reference_no, payment_method, amount, company_id, bank_account_id,
          related_collection_id, source_type, source_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.collection_date, ledgerReference(row), method, amount, companyId, bankId,
        row.linked_collection_id || null, row.source_type, row.source_id, userId]
    );
    return result.insertId;
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, `Collection ${label(row)} already has a ${method} posting`);
    }
    throw error;
  }
};

const setLineLedger = (connection, lineId, fields) => {
  const columns = Object.keys(fields);
  return connection.query(
    `UPDATE collection_transactions SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((c) => fields[c]), lineId]
  );
};

// ---------------------------------------------------------------------------
// One posting per payment method. Each returns nothing; the line is updated
// with the ledger row id it created.
// ---------------------------------------------------------------------------
const postCash = async (connection, ctx) => {
  await recordCashTransaction(connection, {
    companyId: ctx.companyId, date: ctx.date, remark: `Collection - Cash (${ctx.ref})`, debit: ctx.amount,
    transactionType: 'Collection - Cash', referenceNumber: ctx.ref, partyName: ctx.party,
    referenceType: FINANCE_REFERENCE_TYPE, referenceId: ctx.row.id, createdBy: ctx.userId
  });
  await setLineLedger(connection, ctx.lineId, { finance_transaction_id: await ol.lastInsertId(connection) });
};

const postBank = async (connection, ctx) => {
  try {
    await recordBankTransaction(connection, {
      bankId: ctx.bankId, date: ctx.date, remark: `Collection - Bank / Online (${ctx.ref})`, debit: ctx.amount,
      transactionType: 'Collection - Bank', referenceNumber: ctx.ref, partyName: ctx.party,
      referenceType: FINANCE_REFERENCE_TYPE, referenceId: ctx.row.id, createdBy: ctx.userId
    });
  } catch (error) {
    if (error.message === 'Bank account not found.') throw new HttpError(400, 'The selected bank account is not active');
    throw error;
  }
  await setLineLedger(connection, ctx.lineId, { finance_transaction_id: await ol.lastInsertId(connection) });
};

// Unique key of one POS card payment across all collections.
const posCardKey = (row, payment) => `${row.source_type}:${row.source_id}:${payment.key}`.slice(0, 191);

// Card Ledger reference of one card payment, from its POS transaction id:
// "SHIFT-211-0104/SALE-20834", "SHIFT-211-0104/ORDER-614". The receipt number is
// NOT used here: the live POS sends non-unique values such as "CASH" (verified:
// 16 payments, and a receipt repeated within one shift); sale / order ids are
// unique. The receipt number is kept in the remark.
const cardPaymentReference = (ref, p) => {
  const id = (p.sale_id ? `SALE-${p.sale_id}` : null) || (p.order_id ? `ORDER-${p.order_id}` : null)
    || (p.receipt_no ? `RCPT-${p.receipt_no}` : p.key);
  return `${ref}/${id}${p.occurrence > 1 ? `-${p.occurrence}` : ''}`.slice(0, REFERENCE_MAX);
};

const TYPE_LABELS = { sale: 'Sale', order_advance: 'Order advance' };

// "HH:mm" of a POS UTC timestamp in the business time zone, or null.
const businessTime = (value) => {
  const d = new Date(String(value || '').replace(/(\.\d{3})\d+/, '$1'));
  if (!value || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.RAVON_POS_TIMEZONE || 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
};
const cardPaymentRemark = (ctx, p) => {
  const what = TYPE_LABELS[p.pos_type] || p.pos_type || 'Card payment';
  const ids = [p.sale_id && `#${p.sale_id}`, p.order_id && `#${p.order_id}`, p.receipt_no && `receipt ${p.receipt_no}`]
    .filter(Boolean).join(', ');
  const time = businessTime(p.date_time);
  return `Collection card - ${what}${ids ? ` ${ids}` : ''}${p.payment_method && p.payment_method !== 'card' ? ` (${p.payment_method})` : ''}`
    + `${time ? ` ${time}` : ''} - ${ctx.ref}${ctx.row.pos_branch_name ? ` - ${ctx.row.pos_branch_name}` : ''}`;
};

const postShiftCardPayments = async (connection, ctx) => {
  for (const p of ctx.cardPayments) {
    const cardId = await createPendingCardTransaction(connection, {
      companyId: ctx.companyId, bankId: ctx.bankId, date: p.date || ctx.date, amount: p.amount,
      referenceNumber: cardPaymentReference(ctx.ref, p), remark: cardPaymentRemark(ctx, p).slice(0, 255),
      createdBy: ctx.userId
    });
    try {
      await connection.query(
        `INSERT INTO collection_card_payments
           (collection_id, collection_transaction_id, pos_card_key, pos_type, pos_sale_id, pos_order_id, pos_receipt_no,
            pos_payment_method, pos_date_time, transaction_date, amount, card_transaction_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ctx.row.id, ctx.lineId, posCardKey(ctx.row, p), p.pos_type, p.sale_id, p.order_id, p.receipt_no,
          p.payment_method, p.date_time, p.date || ctx.date, p.amount, cardId, ctx.userId]
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, `Card payment ${cardPaymentReference(ctx.ref, p)} was already posted to the Card Ledger`);
      }
      throw error;
    }
  }
};

const postCard = async (connection, ctx) => {
  if (ctx.cardPayments) return postShiftCardPayments(connection, ctx);
  const cardId = await createPendingCardTransaction(connection, {
    companyId: ctx.companyId, bankId: ctx.bankId, date: ctx.date, amount: ctx.amount,
    referenceNumber: ctx.ref, remark: `Collection - Card (${ctx.ref})`, createdBy: ctx.userId
  });
  await setLineLedger(connection, ctx.lineId, { card_transaction_id: cardId });
};

const postOther = async (connection, ctx, { accountName, sourceType, debit, credit, remark }) => {
  const ledger = await ol.requireSystemLedger(connection, accountName, { companyId: ctx.companyId });
  const entryId = await ol.createImpactEntry(connection, {
    otherLedgerId: ledger.id, sourceType, sourceId: ctx.lineId, date: ctx.date, debit, credit,
    companyId: ctx.companyId, referenceNo: ctx.ref, remark, createdBy: ctx.userId
  });
  await setLineLedger(connection, ctx.lineId, { other_ledger_id: ledger.id, other_ledger_transaction_id: entryId });
};

const postAr = (connection, ctx) => postOther(connection, ctx, {
  accountName: ol.AR_ACCOUNT_NAME, sourceType: ol.SOURCE_COLLECTION_AR,
  debit: ctx.amount, credit: 0, remark: `AR Collection (${ctx.ref})`
});

const postArSettlement = (connection, ctx) => postOther(connection, ctx, {
  accountName: ol.AR_ACCOUNT_NAME, sourceType: ol.SOURCE_COLLECTION_AR_SETTLEMENT,
  debit: 0, credit: ctx.amount,
  remark: `AR settled - Credit Payment${ctx.row.cashier_name ? ` - ${ctx.row.cashier_name}` : ''} (${ctx.ref})`.slice(0, 255)
});

const RECEIVED_METHODS = [PAYMENT_METHODS.CASH, PAYMENT_METHODS.CARD, PAYMENT_METHODS.BANK];

/**
 * Ledger effects that are not received money: a Credit Payment settles the
 * customer's AR by the amount received (Cash + Card + Bank / Online). Every
 * other source has none, so Shift Collection / Employee Deduction are unchanged.
 */
const settlementsOf = (row, postings) => {
  if (row.source_type !== SOURCES.CREDIT_PAYMENT) return [];
  const received = postings.filter((p) => RECEIVED_METHODS.includes(p.method)).reduce((sum, p) => sum + p.amount, 0);
  const amount = Number(received.toFixed(2));
  return amount > 0 ? [{ method: PAYMENT_METHODS.AR_SETTLEMENT, amount }] : [];
};

const postShortExcess = (connection, ctx) => {
  const isDeduction = ctx.row.source_type === SOURCES.EMPLOYEE_DEDUCTION;
  const isShort = ctx.amount > 0;
  const amount = Math.abs(ctx.amount);
  let remark;
  if (isDeduction) {
    remark = `Employee deduction${ctx.row.employee_name ? ` - ${ctx.row.employee_name}` : ''} (${ctx.ref}`
      + `${ctx.linkedRef ? `, for ${ctx.linkedRef}` : ''})`;
  } else {
    remark = `${isShort ? 'Short' : 'Excess'} - ${ctx.row.cashier_name || 'cashier'} (${ctx.ref})`;
  }
  return postOther(connection, ctx, {
    accountName: ol.SHORT_EXCESS_ACCOUNT_NAME, sourceType: ol.SOURCE_COLLECTION_SHORT_EXCESS,
    debit: isShort ? amount : 0, credit: isShort ? 0 : amount, remark: remark.slice(0, 255)
  });
};

const POSTERS = {
  [PAYMENT_METHODS.CASH]: postCash,
  [PAYMENT_METHODS.BANK]: postBank,
  [PAYMENT_METHODS.CARD]: postCard,
  [PAYMENT_METHODS.AR]: postAr,
  [PAYMENT_METHODS.SHORT_EXCESS]: postShortExcess,
  [PAYMENT_METHODS.AR_SETTLEMENT]: postArSettlement
};

/**
 * Approves pending collections. Already-completed ones are skipped (idempotent).
 * @param items [{ id, company_id?, bank_account_id?, card_bank_account_id? }]
 * @returns {{ approved: Array, skipped: Array }}
 */
const approveCollections = async (connection, { items, userId }) => {
  if (!Array.isArray(items)) throw new HttpError(400, 'Select at least one record to approve');
  const ids = parseIds(items.map((item) => item?.id));
  const inputById = new Map(items.map((item) => [Number(item.id), item]));
  const approved = [];
  const skipped = [];

  for (const id of ids) {
    const input = inputById.get(id) || {};
    const row = await lockCollection(connection, id);

    if (row.status === 'completed') {
      skipped.push({ id, reference: label(row), reason: 'already completed' });
      continue;
    }
    if (row.status !== 'pending') {
      throw new HttpError(409, `Collection ${label(row)} is ${row.status} and cannot be approved`);
    }

    // --- validation: everything is checked BEFORE the first write -------------
    if (!row.department_id && row.pos_branch_name) {
      throw new HttpError(400, `Collection ${label(row)}: POS branch "${row.pos_branch_name}" is not mapped to a department. `
        + 'Add or rename the department (or set RAVON_POS_BRANCH_DEPARTMENT_MAP), refresh from the POS, then approve.');
    }
    const [lines] = await connection.query('SELECT id FROM collection_transactions WHERE collection_id = ? LIMIT 1', [id]);
    if (lines.length > 0) throw new HttpError(409, `Collection ${label(row)} already has ledger postings`);

    if (row.reference_no) {
      const [sameRef] = await connection.query(
        `SELECT id FROM collections
          WHERE source_type = ? AND reference_no = ? AND id <> ? AND status = 'completed' LIMIT 1`,
        [row.source_type, row.reference_no, id]
      );
      if (sameRef.length > 0) {
        throw new HttpError(409, `POS reference ${label(row)} was already approved as collection #${sameRef[0].id}`);
      }
    }

    let companyId = row.company_id;
    if (!companyId && row.linked_collection_id) {
      // An employee deduction belongs to the company of the shift it settles.
      const [linked] = await connection.query('SELECT company_id FROM collections WHERE id = ?', [row.linked_collection_id]);
      companyId = linked[0]?.company_id || null;
    }
    if (!companyId) {
      const chosen = optionalId(input.company_id);
      if (!chosen) throw new HttpError(400, `Select a company for collection ${label(row)}`);
      const [company] = await connection.query('SELECT id FROM company WHERE id = ?', [chosen]);
      if (!company.length) throw new HttpError(400, `Company not found for collection ${label(row)}`);
      companyId = company[0].id;
    }

    if (row.pos_total_amount !== null && row.pos_total_amount !== undefined
      && Math.abs(Number(row.pos_total_amount) - Number(row.total_amount)) > 0.009) {
      throw new HttpError(400, `Collection ${label(row)}: the POS total (${Number(row.pos_total_amount).toFixed(2)}) does not `
        + `match Cash + Card + Bank / Online + AR (${Number(row.total_amount).toFixed(2)}). It cannot be approved.`);
    }

    const postings = postingsOf(row);
    if (postings.length === 0) throw new HttpError(400, `Collection ${label(row)} has no amount to post`);

    // Shift card: the individual POS card payments are what gets posted. They must
    // reconcile with the card total and none of them may be in the Card Ledger yet.
    let cardPayments = null;
    if (row.source_type === SOURCES.SHIFT && postings.some((p) => p.method === PAYMENT_METHODS.CARD)) {
      const details = cardPaymentsOf(row.raw_payload);
      const check = reconcileCard(row.card_amount, details);
      if (!check.ok) {
        throw new HttpError(400, `Collection ${label(row)}: card cannot be posted - ${check.reason}. `
          + 'Nothing was posted; check the shift\'s card payments in the POS.');
      }
      const keys = details.payments.map((p) => posCardKey(row, p));
      const [already] = await connection.query(
        'SELECT pos_card_key FROM collection_card_payments WHERE pos_card_key IN (?) LIMIT 1', [keys]
      );
      if (already.length > 0) {
        throw new HttpError(409, `Collection ${label(row)}: card payment ${already[0].pos_card_key} is already in the Card Ledger`);
      }
      cardPayments = details.payments;
    }

    const methods = new Set(postings.map((p) => p.method));
    let bankId = null;
    let cardBankId = null;
    if (methods.has(PAYMENT_METHODS.BANK)) {
      const requested = optionalId(input.bank_account_id) || await bankFromPos(connection, row.pos_bank_account, companyId);
      bankId = await requireCompanyBank(connection, requested, companyId,
        `Select the bank account that received the online / bank amount of ${label(row)}`);
    }
    if (methods.has(PAYMENT_METHODS.CARD)) {
      cardBankId = await requireCompanyBank(connection, optionalId(input.card_bank_account_id), companyId,
        `Select the card settlement bank account for ${label(row)}`);
    }

    let linkedRef = null;
    if (row.source_type === SOURCES.EMPLOYEE_DEDUCTION && row.linked_collection_id) {
      const [linked] = await connection.query(
        'SELECT id, source_type, source_id, reference_no FROM collections WHERE id = ?', [row.linked_collection_id]
      );
      if (linked.length) linkedRef = ledgerReference(linked[0]);
    }

    // --- postings ---------------------------------------------------------------
    const ref = ledgerReference(row);
    const posted = [];
    for (const { method, amount } of [...postings, ...settlementsOf(row, postings)]) {
      const lineBank = method === PAYMENT_METHODS.BANK ? bankId : method === PAYMENT_METHODS.CARD ? cardBankId : null;
      const lineId = await insertLine(connection, row, { method, amount, companyId, bankId: lineBank, userId });
      await POSTERS[method](connection, {
        row, lineId, method, amount, companyId, bankId: lineBank, ref, linkedRef, cardPayments,
        date: row.collection_date, party: row.cashier_name || row.employee_name || null, userId
      });
      posted.push({
        method, amount, lineId,
        ...(method === PAYMENT_METHODS.CARD && cardPayments ? { cardPayments: cardPayments.length } : {})
      });
    }

    const [update] = await connection.query(
      `UPDATE collections SET status = 'completed', approved_by = ?, approved_at = NOW(), company_id = ?
        WHERE id = ? AND status = 'pending'`,
      [userId, companyId, id]
    );
    if (update.affectedRows !== 1) {
      throw new HttpError(409, `Collection ${label(row)} was changed by someone else; nothing was saved`);
    }
    approved.push({ id, reference: ref, postings: posted });
  }
  return { approved, skipped };
};

/** Pending -> rejected. Never posts anything. Already-rejected ones are skipped. */
const rejectCollections = async (connection, { ids: rawIds, reason, userId }) => {
  const ids = parseIds(rawIds);
  const text = String(reason ?? '').trim().replace(/\s+/g, ' ');
  if (!text) throw new HttpError(400, 'A rejection reason is required');
  if (text.length > REASON_MAX) throw new HttpError(400, `Rejection reason cannot exceed ${REASON_MAX} characters`);

  const rejected = [];
  const skipped = [];
  for (const id of ids) {
    const row = await lockCollection(connection, id);
    if (row.status === 'rejected') { skipped.push({ id, reference: label(row), reason: 'already rejected' }); continue; }
    if (row.status !== 'pending') {
      throw new HttpError(409, `Collection ${label(row)} is already ${row.status} and cannot be rejected`);
    }
    const [update] = await connection.query(
      `UPDATE collections SET status = 'rejected', rejection_reason = ?, rejected_by = ?, rejected_at = NOW()
        WHERE id = ? AND status = 'pending'`,
      [text, userId, id]
    );
    if (update.affectedRows !== 1) throw new HttpError(409, `Collection ${label(row)} was changed by someone else`);
    rejected.push({ id, reference: label(row) });
  }
  return { rejected, skipped };
};

/** Rejected -> pending again (a rejection made by mistake). */
const restoreCollections = async (connection, { ids: rawIds }) => {
  const ids = parseIds(rawIds);
  for (const id of ids) {
    const row = await lockCollection(connection, id);
    if (row.status !== 'rejected') {
      throw new HttpError(409, `Collection ${label(row)} is ${row.status}; only rejected records can be moved back to Pending`);
    }
    await connection.query(
      `UPDATE collections SET status = 'pending', rejection_reason = NULL, rejected_by = NULL, rejected_at = NULL
        WHERE id = ? AND status = 'rejected'`,
      [id]
    );
  }
  return ids;
};

module.exports = {
  approveCollections,
  rejectCollections,
  restoreCollections,
  ledgerReference,
  cardPaymentReference,
  posCardKey,
  FINANCE_REFERENCE_TYPE
};
