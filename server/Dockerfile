FROM node:24-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && mkdir /data && chown node:node /data
COPY server/auth.mjs server/start.mjs server/loyalty.mjs server/loyalty-admin.mjs server/import-customers.mjs server/passwords.mjs server/staff.mjs server/provision-passwords.mjs server/content-store.mjs server/ai-description.mjs server/keyword-suggestions.mjs server/admin.mjs server/analytics.mjs server/geo.mjs ./
COPY server/catalog-seed.json server/categories-seed.json ./
USER node
EXPOSE 8080
CMD ["node", "start.mjs"]
