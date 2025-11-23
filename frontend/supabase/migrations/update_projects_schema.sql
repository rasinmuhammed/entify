-- Add missing columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS active_phase TEXT DEFAULT 'profile',
ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS blocking_rules JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS comparison_config JSONB DEFAULT '[]'::jsonb;

-- Update existing projects to have default values
UPDATE projects 
SET active_phase = 'profile' 
WHERE active_phase IS NULL;

UPDATE projects 
SET blocking_rules = '[]'::jsonb 
WHERE blocking_rules IS NULL;

UPDATE projects 
SET comparison_config = '[]'::jsonb 
WHERE comparison_config IS NULL;
