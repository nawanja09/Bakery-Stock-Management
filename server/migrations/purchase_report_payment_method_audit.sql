-- READ-ONLY audit. Lists invoices where the OLD source (purchases.payment_method)
-- disagrees with the payment record(s) shown in Purchase Details (payment_history).
-- Nothing is modified. Same invoice<->payment association Purchase Details uses.
SELECT p.id, p.invoice_no, p.payment_method AS old_report_value,
       GROUP_CONCAT(DISTINCT ph.payment_method ORDER BY ph.payment_date, ph.id) AS purchase_details_method
FROM purchases p
JOIN payment_history ph
  ON (ph.purchase_id = p.id AND NOT EXISTS (SELECT 1 FROM purchase_payment_allocations a2 WHERE a2.payment_history_id = ph.id))
  OR EXISTS (SELECT 1 FROM purchase_payment_allocations a WHERE a.payment_history_id = ph.id AND a.purchase_id = p.id)
WHERE (p.deleted = 0 OR p.deleted IS NULL) AND ph.payment_method <> ''
GROUP BY p.id, p.invoice_no, p.payment_method
HAVING FIND_IN_SET(p.payment_method, purchase_details_method) = 0
ORDER BY p.id;
