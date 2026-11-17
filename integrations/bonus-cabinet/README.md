# Password issuance inside app.sizey.ru

The employee client card receives a “Доступ в SIZEY” block. It uses the existing cabinet JWT and refresh flow; there is no second staff login. A same-origin Next.js route validates the client UUID and request origin, then forwards the employee token to the internal customer-auth service. That service verifies the token with the existing employee backend and allows ADMIN/CASHIER roles only.

GET returns status metadata without passwords/hashes. POST requires explicit identity confirmation and the expected phone shown in the card. The customer service resolves the actual phone from the existing loyalty record, rejects stale phone numbers, and issues through the same audited credential lifecycle as the standalone staff screen. Newly created loyalty clients can be provisioned on demand. Issuance never writes to the loyalty database.

Passwords appear only in the authenticated issuance response, are hidden after 60 seconds, are not cached, and are not saved to browser storage. Losing a displayed password requires a new reset. The first customer login requires changing the temporary password.

The installer copies only these overlay files and patches one import/component call in the existing client card. It checks the original source fingerprint, saves source/image backups on-server, builds while the current cabinet remains running, tests a private canary container, and replaces only the employee frontend container. On failure it restores the old source and image. The employee backend, database and outer Caddy proxy are not restarted.

Validation: customer JWT authorization/role checks, stale-phone detection, account creation, no-store proxy responses, origin checks, request-body filtering and generic upstream errors are covered by tests. The original Next.js app production build was checked locally against its existing source and lockfile.
