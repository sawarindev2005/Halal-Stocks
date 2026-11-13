# API server (Express + ระบบแจ้งเตือน + สรุปข่าว)
# build จาก root ของโปรเจกต์ เพราะต้องใช้โฟลเดอร์ shared/ ด้วย:
#   docker build -f server/Dockerfile .
FROM node:24-alpine

WORKDIR /app/server

# ติดตั้ง dependencies ก่อน copy โค้ด เพื่อให้ Docker ใช้ cache ได้เมื่อแก้แค่โค้ด
# (ต้องมี devDependencies ด้วย เพราะ server รันไฟล์ .ts ผ่าน tsx)
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY shared /app/shared
COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/data/shariah_list.json ./data/shariah_list.json

ENV NODE_ENV=production \
    PORT=4000 \
    TZ=Asia/Bangkok

# ไม่รันด้วย root
RUN chown -R node:node /app/server/data
USER node

EXPOSE 4000
CMD ["node", "--import", "tsx", "src/index.ts"]
