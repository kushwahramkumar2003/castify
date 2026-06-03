-- =============================================================================
-- PostgreSQL init script
-- Runs automatically when postgres starts for the FIRST time (fresh volume).
-- =============================================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram index for text search

-- Confirm
SELECT 'Castify database initialised' AS status;
