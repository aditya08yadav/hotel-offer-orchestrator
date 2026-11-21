# ---- build stage ----
# (Debian slim, not Alpine: Temporal's native core-bridge needs glibc)
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# Same image runs both processes; docker-compose overrides the command for the worker.
CMD ["node", "dist/server.js"]
