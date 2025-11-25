-- Add global_settings column to projects table
-- This stores global Splink configuration like probability_two_random_records_match

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS global_settings JSONB DEFAULT '{"probability_two_random_records_match": 0.0001}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN projects.global_settings IS 'Global Splink settings including probability_two_random_records_match and other model parameters';
