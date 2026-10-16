CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, redirect_uris TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_grants (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('consent','code','access')),
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  state TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_expiry ON oauth_grants(expires);
