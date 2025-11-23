-- Add cleaning metadata columns to datasets table
ALTER TABLE datasets
ADD COLUMN IF NOT EXISTS cleaning_status TEXT DEFAULT 'raw' CHECK (cleaning_status IN ('raw', 'cleaning', 'cleaned')),
ADD COLUMN IF NOT EXISTS cleaned_file_path TEXT,
ADD COLUMN IF NOT EXISTS cleaning_metadata JSONB,
ADD COLUMN IF NOT EXISTS data_quality_score NUMERIC(5,2);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_datasets_cleaning_status ON datasets(cleaning_status);

-- Comment the columns
COMMENT ON COLUMN datasets.cleaning_status IS 'Current cleaning status of the dataset';
COMMENT ON COLUMN datasets.cleaned_file_path IS 'Path to cleaned CSV file in Supabase Storage';
COMMENT ON COLUMN datasets.cleaning_metadata IS 'JSON containing cleaning rules applied, timestamps, and statistics';
COMMENT ON COLUMN datasets.data_quality_score IS 'Overall data quality score (0-100)';
