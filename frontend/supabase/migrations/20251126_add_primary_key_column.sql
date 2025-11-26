-- Add primary_key_column to datasets table
ALTER TABLE datasets 
ADD COLUMN IF NOT EXISTS primary_key_column TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN datasets.primary_key_column IS 'The column name used as unique identifier for entity resolution';
