-- D1 migration 0006: Batch receipt execution status metadata (CV hardening; additive only)

ALTER TABLE account_deletion_batch_receipts ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE account_deletion_batch_receipts ADD COLUMN completed_at_iso TEXT;