-- Add agentskills.io spec-compatible fields to the skills table
ALTER TABLE skills ADD COLUMN license TEXT;
ALTER TABLE skills ADD COLUMN compatibility TEXT;
ALTER TABLE skills ADD COLUMN metadata TEXT; -- JSON blob (string→string map)
ALTER TABLE skills ADD COLUMN allowed_tools TEXT;
