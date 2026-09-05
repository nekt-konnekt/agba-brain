-- Keep pg_net's extension registration out of public.
-- pg_net recreates its runtime objects in the net schema.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
