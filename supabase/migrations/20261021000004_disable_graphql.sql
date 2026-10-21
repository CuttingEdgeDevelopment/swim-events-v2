-- The site reads events over REST only, so the GraphQL endpoint is switched off.
-- Clears the security advisor's warnings about tables being visible in the GraphQL schema.
-- (Turned off in the dashboard on 2026-10-21; kept here so the history matches.)

drop extension if exists pg_graphql;
