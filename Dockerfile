FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY public ./public
COPY src ./src
COPY tsconfig.json ./
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=4402 HOST=0.0.0.0 GRID_MODE=demo
EXPOSE 4402
CMD ["node", "--import", "tsx", "src/server.ts"]
