-- Trigram indexes for fuzzy name search (pg_trgm extension is enabled in the init migration)
CREATE INDEX IF NOT EXISTS "Lead_normalizedName_trgm" ON "Lead" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Client_normalizedName_trgm" ON "Client" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Broker_name_trgm" ON "Broker" USING gin ((lower("firstName" || ' ' || "lastName")) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Brokerage_name_trgm" ON "Brokerage" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Unit_code_trgm" ON "Unit" USING gin (lower("code") gin_trgm_ops);
