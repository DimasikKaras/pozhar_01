FROM node:20-alpine AS build
WORKDIR /app

# Используем package-lock.json для мгновенной установки без сетевого резолвинга
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
# Ограничиваем потребление памяти node до 1024MB для стабильной и быстрой сборки на VPS
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]

