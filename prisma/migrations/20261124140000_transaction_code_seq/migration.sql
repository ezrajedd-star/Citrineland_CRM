-- Sequence for human-readable transaction codes (TX-YYYY-000123); safe under concurrency.
CREATE SEQUENCE IF NOT EXISTS transaction_code_seq START 1;
