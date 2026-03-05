-- Update default agent model from Claude to Workers AI auto-routing
UPDATE agents SET model = 'workers-ai/auto' WHERE model = 'anthropic/claude-sonnet-4-20250514';
