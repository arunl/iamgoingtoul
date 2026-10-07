FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY public ./public
COPY help ./help
COPY src ./src
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
