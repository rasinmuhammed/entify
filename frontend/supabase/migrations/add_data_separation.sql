-- Add columns for separate original and cleaned data storage
-- This allows side-by-side comparison and preserves the original data

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS original_file_path TEXT,
ADD COLUMN IF NOT EXISTS cleaned_file_path TEXT,
ADD COLUMN IF NOT EXISTS cleaning_applied BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cleaning_stats JSONB DEFAULT '{}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN projects.original_file_path IS 'Path to the original uploaded dataset file';
COMMENT ON COLUMN projects.cleaned_file_path IS 'Path to the cleaned dataset file (with _clean suffix columns)';
COMMENT ON COLUMN projects.cleaning_applied IS 'Whether data cleaning has been applied to this project';
COMMENT ON COLUMN projects.cleaning_stats IS 'Statistics about the cleaning process (rows affected, columns modified, etc.)';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_cleaning_applied ON projects(cleaning_applied);
