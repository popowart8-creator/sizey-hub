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

Extended reports
----------------
Reports also support an inclusive from/to date range (up to 90 retained Moscow
calendar days), and compare against the preceding equal-length period only when
that entire baseline is available. A goal is a session with cart_add or a
successful registration; demo checkout is never treated as a purchase.

Session acquisition stores a known channel/provider or a sanitized base referral
domain, never raw UTM values, full URLs, query strings or referrer paths. Legacy
sessions have an explicit untracked source. Geography uses the bundled DB-IP
Lite snapshot locally through mmdb-lib: only approximate country/city are saved,
not IP or coordinates. The snapshot date and required DB-IP attribution appear
in the report. Package updates refresh the snapshot; geolocation is approximate
and may reflect VPN or carrier exit locations.

Nested screens have random view IDs. Visible/focused active time is emitted in
bounded chunks; reading stops after one idle minute. Scroll thresholds are
recorded once per view and aggregated by distinct session. Screens without
scrollable content do not emit scroll depth. Average active time and scroll
coverage only use new measured views/sessions, leaving legacy measurements blank.

Additive event_details and analytics_sessions tables preserve the original
events layout so an old API process can keep inserting events during a canary
check. No historical acquisition, engagement or geography values are fabricated.

Simplified analytics overview
-----------------------------
The overview prioritizes visitors, sessions, the selected goal and conversion.
Incomplete comparison baselines do not show warning badges or invented deltas.
Only nonzero traffic channels are listed, with provider details on expansion;
daily tables, operating systems, geography and methodology are collapsed.

Reporting groups tablets with mobile throughout summary, daily and screen shares;
raw device classification remains available in storage. Short collection histories
(up to 48 hours) include hourly buckets beginning at collection time. Daily charts
exclude dates before collection, and the expanded daily table marks those dates
unavailable rather than presenting them as measured zeros. Smooth chart geometry
is shape-preserving, with exact values in the tooltip and optional column mode.

Product editor and shared catalog options
-----------------------------------------
Products accept up to 20 JPG/PNG/WebP photographs (3 MiB each), selected together
or dropped anywhere in the editor. Uploads remain per-file bounded API requests.
The gallery previews every saved image, supports drag ordering and arrow controls,
and keeps cover = first image. Only persisted media URLs reach the product body;
failed uploads must be retried or removed before saving. Cancelling an editor
revokes local object previews. Banner uploads remain a single photograph.

Categories and sizes use shared hub_options dictionaries, seeded additively from
existing product values. Editors can select, unassign and create values. The
Products page has a Categories and Sizes manager for global deletion. Used values
require an existing replacement; updates preserve product IDs, photos and all
other fields and increment affected product/banners versions atomically. Removing
a banner-only category defaults it to All when no replacement is selected.
Dictionary revisions reject stale removals, and stale product editors cannot
silently restore globally replaced assignments. Unused options can be removed
without changing products. The existing optimistic product-version guard remains.


### Описания с AI и порядок товаров
В редакторе товара откройте «Описание → AI-помощник → Настройки AI». Укажите свой API-ключ OpenRouter и выберите доступную бесплатную модель. Ключ хранится на сервере в AES-256-GCM с ключом, производным от AUTH_SECRET; файл настроек имеет права 0600. В ответах API ключ не возвращается. Не меняйте AUTH_SECRET без повторного подключения AI.

Запросы используют только модели `:free` с нулевыми ценами и ограничением цены провайдера 0. Платного резервного варианта нет. Название реальной модели видно в редакторе; доступность и лимиты определяет OpenRouter. Факты о товаре указываются вручную, фотографии и данные клиентов в AI не отправляются. Предложение AI нужно проверить и применить, затем сохранить товар.

Каталог фильтруется чипсами статуса и категории. Новые товары добавляются в начало; редактирование не меняет позицию. Перетаскивание за значок или стрелки меняют общий порядок и в админке, и в приложении. Скрытые фильтром товары сохраняют взаимный порядок. Конкурирующие изменения защищены ревизией, черновики покупателям не показываются.
