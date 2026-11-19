SIZEY administration runs at https://admmm.sizey.ru using existing ACTIVE ADMIN
employee credentials. Customer and CASHIER accounts cannot access the editor.

Products and banners live in /opt/sizey/hub-api/data/hub-content.sqlite. Uploads
live in its media directory. Back up this directory along with auth.sqlite;
frontend releases do not replace these files. Initial catalog seeds run once.

Drafts are private. Saving a published item changes /hub-api/content, fetched by
Hub in the background on launch. Conflicting edits return 409 without overwriting.
The employee bonus cabinet remains the place for bonus operations and issuing
customer passwords. Orders stay empty until real checkout is connected.

npm run build produces both dist/index.html and dist/admin/index.html. The inner
Caddy host route selects the admin entry; assets are shared immutable files.
The manual Install SIZEY Hub administration workflow updates the isolated API
and Caddy routing with backups and rollback, without restarting loyalty services.

Analytics
---------
The Analytics section reads first-party anonymous events from analytics.sqlite,
separate from authentication and loyalty data. Only active administrators can
read reports. POST /hub-api/events accepts a bounded allowlist from the Hub
origin; unknown fields, including raw search text and personal data, are rejected.
No IP addresses, full user agents, customer IDs or credentials are persisted.

A visitor is a random browser-local ID (90-day lifetime), not a person. Sessions
restart after 30 minutes of inactivity. Windows, macOS and Linux are separated
from iOS/Android; desktop/mobile/tablet and PWA/browser are reported independently.
Daily reports use Europe/Moscow boundaries. Search counts record a pause in
input and the number of results, without the query. Product views, favorites and
cart additions count actions; checkout_start is explicitly demo checkout and
never a purchase. Repeated event IDs are ignored. Browser privacy controls and
network loss can reduce counts. Collection starts with this release, not earlier.

Events are pruned on startup and hourly after 90 days. Routine deployment backups
do not archive analytics events. Delivery batches are bounded and nonblocking;
analytics failures must not interrupt shopping. Browser Do Not Track and Global
Privacy Control disable collection.
