-- Migration: 014_add_bank_id_to_payment_history.sql
-- Add bank_id to payment_history for bank account tracking on payments

ALTER TABLE `payment_history`
  ADD COLUMN IF NOT EXISTS `bank_id` INT(11) NULL AFTER `check_number`;

ALTER TABLE `expenses_cheque_registry`
  ADD COLUMN IF NOT EXISTS `bank_id` INT(11) NULL AFTER `bank`;
