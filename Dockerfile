FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apk upgrade --no-cache

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

USER node
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3006/health || exit 1
CMD ["node", "server-dist/index.js"]
