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
