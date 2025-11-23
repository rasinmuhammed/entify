-- Add blocking rules and comparison configuration to projects table
-- This allows persistence of user configurations across sessions

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS blocking_rules JSONB DEFAULT '[]'::jsonb;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS comparison_config JSONB DEFAULT '[]'::jsonb;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add comments for documentation
COMMENT ON COLUMN projects.blocking_rules IS 'Array of SQL blocking rule expressions, e.g. ["l.email = r.email"]';
COMMENT ON COLUMN projects.comparison_config IS 'Array of comparison configurations with method, weight, threshold';
COMMENT ON COLUMN projects.last_updated IS 'Timestamp of last configuration update';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_last_updated ON projects(last_updated DESC);
