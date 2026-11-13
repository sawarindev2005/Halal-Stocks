# หน้าเว็บ: build ด้วย Vite แล้วเสิร์ฟด้วย nginx
# build จาก root ของโปรเจกต์ เพราะต้องใช้โฟลเดอร์ shared/ ด้วย:
#   docker build -f client/Dockerfile .

# ---- ขั้นที่ 1: build ไฟล์ static ----
FROM node:24-alpine AS build
WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY shared /app/shared
COPY client ./
RUN npm run build

# ---- ขั้นที่ 2: เสิร์ฟด้วย nginx (image เล็ก ไม่มี Node) ----
FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
