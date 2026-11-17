# Customer phone/password authentication

Customers sign in with phone and password. The existing 13 customer identities are reserved, so public registration cannot overwrite their credentials. Existing active loyalty numbers not yet imported are also reserved using an exact lookup.

Passwords use individually salted scrypt (N=32768, r=8, p=1). Password work is concurrency-limited. Login/registration/password changes are rate-limited. Sessions are opaque Secure/HttpOnly/SameSite cookies, stored as hashes. New registrations have phone_verified=false and cannot read bonuses until an employee checks their identity. There is no SMS or phone-only password reset endpoint.

Initial individual passwords are generated on-server and stored as scrypt hashes with an AES-GCM-encrypted temporary delivery envelope. No password lists are exported. The staff screen is /?staff=1. It authenticates against the existing employee backend; its access token stays server-side in an expiring memory session and is checked against the backend on each privileged request. No employee login credentials or access tokens are sent to the customer browser.

An employee confirms the customer's identity and phone before issuing a password. The initial password is delivered once; its encrypted envelope is deleted. Later issuance creates a new random password. Issuance revokes all customer sessions, marks the phone confirmed and requires a password change before bonus access. Issuance is audited locally with employee ID, customer ID and time, never passwords. Staff access is revoked when the existing backend no longer accepts the employee token.

Customers must enter the current/temporary password to change it. Password changes rotate sessions and reject concurrent password changes. Newly registered accounts do not gain access to bonus data from the number alone.

Loyalty is read directly through the dedicated read-only role. Available points follow the existing unexpired-bonus-lot rules; balances and records in the original system are not modified. A local on-server SQLite snapshot is saved before migration. The setup reloads only the inner hub Caddy and updates only the customer API, not the employee bonus containers.

Run npm ci --prefix server && npm run test:auth, then npm run build. Customer identity and password provisioning scripts are idempotent. Never store real passwords, AUTH_SECRET, database credentials or private SSH keys in Git, artifacts or chat.
