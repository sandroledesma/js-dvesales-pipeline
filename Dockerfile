FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev || npm i --omit=dev

COPY src ./src

EXPOSE 8080

ENV NODE_ENV=production

CMD ["node","src/server.js"]

