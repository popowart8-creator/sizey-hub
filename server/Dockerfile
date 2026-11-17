FROM node:24-alpine
WORKDIR /app
COPY server/auth.mjs server/start.mjs ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "start.mjs"]
