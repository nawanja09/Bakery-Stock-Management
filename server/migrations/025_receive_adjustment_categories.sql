-- Allow Finance receive records to be audited in the Adjustment Summary.
ALTER TABLE rm_adjustment_records
  MODIFY COLUMN category ENUM(
    'Department',
    'Invoice',
    'Issuance',
    'Wastage',
    'Petty Cash Voucher',
    'Expense Bill',
    'Cash Receive',
    'Bank Receive'
  ) NOT NULL;
