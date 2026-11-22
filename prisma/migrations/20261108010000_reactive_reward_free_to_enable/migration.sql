-- Switching Reactive Reward on is free. Its points are charged by the Reactions that are active
-- (1 point for the first 10, then 1 more per 5), computed in WidgetRepository, not from this column.
UPDATE "WidgetType" SET cost = 0 WHERE slug = 'reactive-reward';
