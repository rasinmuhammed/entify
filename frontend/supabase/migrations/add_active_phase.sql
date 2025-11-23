-- Add active_phase column to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS active_phase TEXT DEFAULT 'profile';

-- Update existing projects to have a default phase
UPDATE projects 
SET active_phase = 'profile' 
WHERE active_phase IS NULL;
