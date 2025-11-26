-- Add project-level configuration persistence
-- This allows blocking rules, comparisons, and settings to be saved and restored

-- Add columns to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS blocking_rules JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS comparisons JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS global_settings JSONB DEFAULT '{"probability_two_random_records_match": 0.0001}',
ADD COLUMN IF NOT EXISTS threshold DECIMAL DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS active_phase VARCHAR(50) DEFAULT 'profile',
ADD COLUMN IF NOT EXISTS laboratory_settings JSONB DEFAULT '{}';

-- Add helpful comments
COMMENT ON COLUMN projects.blocking_rules IS 'Array of blocking rule SQL strings for Splink';
COMMENT ON COLUMN projects.comparisons IS 'Array of comparison configurations for entity matching';
COMMENT ON COLUMN projects.global_settings IS 'Splink global settings including probability_two_random_records_match';
COMMENT ON COLUMN projects.threshold IS 'Match probability threshold for clustering (0.0 to 1.0)';
COMMENT ON COLUMN projects.active_phase IS 'Current workflow phase: profile, cleaning, blocking, comparisons, training, laboratory, or results';
COMMENT ON COLUMN projects.laboratory_settings IS 'Advanced Splink parameters for Laboratory phase';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_active_phase ON projects(active_phase);
