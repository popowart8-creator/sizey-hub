# Customer SMS authorization and existing loyalty

Node.js 24 service. Customer sessions use Secure HttpOnly SameSite cookies and server-side storage. SMS.ru delivers one-time codes (5 minutes, 5 attempts). Resends and send volumes are rate-limited. No development-code bypass exists. No configured SMS key means request-code returns 503 and no code is generated.

The read-only PostgreSQL role `sizey_hub_reader` can select only required columns from clients, loyalty_levels, bonus_lots and transactions. Customer lookup uses an exact normalized phone from the verified session. Available balance sums positive, unexpired bonus lots, following the existing bonus ledger rules. History uses balance_after minus balance_before, with no employee notes exposed. Unknown numbers return linked=false with no fictitious balance. Duplicate matches fail closed.

`import-customers.mjs` imports active client IDs and normalized phones into the auth database on the server, without credentials or sessions. It does not copy balances or change the loyalty database. Access still requires an SMS proof of phone ownership. Invalid phone formats are skipped and reported as an aggregate count only.

One-time deployment: deploy/install-auth.py is run as root through the manual GitHub installation workflow. It creates the least-privilege database role, keeps its random credentials and auth secret in a root-only server .env, builds the isolated API container, imports identities, verifies all linked customers without exporting their records, and reloads only the internal SIZEY Caddy container. The employee bonus system and outer proxy remain running.

A persistent `/opt/sizey/hub-api/data` directory stores auth SQLite data. The API is internal-only on Docker networks proxy and sizey_prod; it publishes no host ports. `/hub-api/*` is routed by the internal hub Caddy with the client address supplied by the trusted outer proxy. Private API paths are excluded from PWA caching.

Tests: npm ci --prefix server && npm run test:auth. Build: npm run build.
Provider documentation: https://sms.ru/api/send . Do not commit SMS_RU_API_ID, AUTH_SECRET, database credentials or private SSH keys. Real SMS end-to-end validation requires a configured SMS.ru account and provider acceptance.
