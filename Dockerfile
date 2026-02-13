FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --only=production

COPY . .
# Don't copy node_modules from host (we have .dockerignore)
RUN chown -R node:node /app

USER node
EXPOSE 3099

ENV NODE_ENV=production
ENV PORT=3099

CMD ["node", "server.js"]
