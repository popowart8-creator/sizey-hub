# Customer phone authorization — integration in progress

This branch is not production-ready until SMS.ru and the existing loyalty API are connected.

Implemented: Russian +7 phone normalization, SMS request and six-digit verification, server-side HMAC-protected one-time challenges (5 minutes, 5 attempts), persisted rate limits (60-second resend, 3 sends/phone/hour, 10/IP/hour, 100 total/day), opaque server sessions in Secure/HttpOnly/SameSite=Lax cookies, logout, profile/bonus UI, service-worker exclusion for private API requests. SQLite stores session token hashes, not plaintext tokens. Codes are not returned in API responses or logged. No test-code bypass exists.

Run tests with `npm run test:auth`. Node.js 24 required. Provider docs: https://sms.ru/api/send . The adapter uses POST and verifies both request-level and destination-level acceptance. SMS.ru acceptance is not a delivery receipt.

## Deployment requirements

- Separate API container built using `docker build -f server/Dockerfile .`; no host ports. Network `proxy`.
- Persistent writable `/data` volume for the unprivileged node user (UID 1000).
- Environment variables from server/.env.example, supplied on server only. Real secrets stay outside Git and the frontend.
- Route `/hub-api/*` from the hub.sizey.ru Caddy site to this API container, preserving the prefix. Caddy must explicitly overwrite `X-Real-IP` with the original client address (e.g. `header_up X-Real-IP {remote_host}`). Never trust client-supplied X-Real-IP without the proxy overwrite.
- API image deployment is not part of the current static-site workflow. Do not merge this branch until the API exists and routing is verified.
- `SMS_RU_API_ID` absent means SMS request fails closed with 503; no code is issued.

## Existing loyalty system — pending source/contract

app.sizey.ru is the employee dashboard. It uses api.sizey.ru/api/auth/login with loginOrPhone/password; that is not customer SMS authentication. Do not expose employee tokens to customer browsers.

The `loyalty(verifiedPhone)` adapter in createAuth must be implemented only after inspecting the existing API or schema. It receives the number from the server session, never a browser-supplied identifier. It must use read-only least-privilege access, retrieve the existing customer and history, and return:

```
{ balance: number, level?: string,
  history: [{ id: string, amount: number, description: string, date: ISODate }] }
```

No duplicate balance or history is created. Until the adapter is configured, /hub-api/loyalty returns 503, not a made-up zero. Resolving unmatched phone numbers, registration in the loyalty system, point redemption and point accrual need the existing system's rules and endpoints. These mutations are not implemented or performed by this branch.
