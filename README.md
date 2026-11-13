# Shariah Stock Watch

เว็บแอปสำหรับดูราคาและกราฟของหุ้นที่ผ่านการคัดกรองชาริอะห์ ทั้งหุ้นไทย (SET) และหุ้นสหรัฐฯ

> ⚠️ **ข้อมูลอาจล่าช้า ไม่ใช่คำแนะนำการลงทุน ผู้ใช้ควรตรวจสอบสถานะชาริอะห์กับแหล่งที่เชื่อถือได้**
>
> รายชื่อหุ้นที่ให้มากับโปรเจกต์นี้เป็น **ข้อมูลตัวอย่าง** เท่านั้น ไม่ใช่ผลการคัดกรองจริง — ดู [วิธีแก้รายชื่อหุ้น](#วิธีแก้รายชื่อหุ้น)

## ความสามารถ

- **Dashboard (`/`)** — ตาราง watchlist แสดงราคา, % เปลี่ยนแปลง (เขียว/แดง), volume
  ค้นหา, กรองตามตลาด/กลุ่มอุตสาหกรรม, เรียงตามคอลัมน์ และรีเฟรชราคาอัตโนมัติทุก 60 วินาที
- **หน้ารายละเอียด (`/stock/:symbol`)** — กราฟแท่งเทียน + volume, เลือกช่วง 1M/3M/6M/1Y/5Y,
  เปิด/ปิดเส้น MA 20/50/100/200, การ์ดสรุปราคา สูง/ต่ำของช่วง 52 สัปดาห์ และข้อมูลการคัดกรองชาริอะห์
- **แจ้งเตือนราคาผ่าน Discord** — ตั้งกฎในหน้าหุ้น (ราคาสูง/ต่ำกว่า X, ขึ้น/ลงเกิน X% ในวัน) ระบบตรวจทุก 5 นาที
  และส่งข้อความเข้าห้อง Discord ของคุณ, หน้า `/alerts` รวมกฎทั้งหมด เปิด/ปิด/ลบได้ — ดู [แจ้งเตือนราคาผ่าน Discord](#แจ้งเตือนราคาผ่าน-discord)
- **สรุปข่าวประจำวันเข้า Discord** — ทุกวัน 07:00 น. ดึงข่าวหุ้นชาริอะห์ในรายชื่อ, การเงินอิสลาม, ตลาดหุ้น และเทค
  ให้ AI (Claude หรือ Gemini) สรุปเป็นภาษาไทยหมวดละ 2–3 ข่าวพร้อมลิงก์ ไม่ส่งข่าวซ้ำ — ดู [สรุปข่าวประจำวัน](#สรุปข่าวประจำวัน)
- โหมดมืด/สว่าง, ใช้บนมือถือได้ (ทดสอบที่ความกว้าง 320px ขึ้นไป), loading skeleton และ error state ทุกหน้า

## Tech stack

| ส่วน       | เทคโนโลยี                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------- |
| Frontend   | React 19, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS v4                   |
| กราฟ       | [lightweight-charts](https://github.com/tradingview/lightweight-charts) (TradingView)       |
| Backend    | Express 5 + TypeScript (รันด้วย tsx), zod                                                   |
| แจ้งเตือน  | `node-cron`, Discord webhook                                                                |
| ฐานข้อมูล  | MySQL 8 (Docker) หรือ SQLite ที่มากับ Node (`node:sqlite`) ตอนรันในเครื่อง                  |
| สรุปข่าว   | RSS (`rss-parser`), Claude API หรือ Gemini API (เลือกได้)                                   |
| Deploy     | Docker Compose (MySQL + server + nginx)                                                     |
| ข้อมูลราคา | [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) (เรียกจากฝั่ง server เท่านั้น) |
| คุณภาพโค้ด | TypeScript strict, ESLint, Prettier, Vitest, Supertest                                      |

## ติดตั้ง

ต้องใช้ **Node.js 22.13 ขึ้นไป** (แนะนำ Node 24 LTS) — ตรวจด้วย `node -v`

```bash
npm run install:all     # ติดตั้ง dependencies ของ root, server และ client
cp .env.example .env    # (Windows PowerShell: Copy-Item .env.example .env)
```

ค่าใน `.env`:

| ตัวแปร                                   | ค่าเริ่มต้น                  | คำอธิบาย                                                                            |
| ---------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `PORT`                                   | `4000`                       | พอร์ตของ API server                                                                 |
| `CLIENT_ORIGIN`                          | `http://localhost:5173`      | origin ของหน้าเว็บที่อนุญาตผ่าน CORS                                                |
| `DISCORD_WEBHOOK_URL`                    | _(ว่าง)_                     | Discord webhook สำหรับแจ้งเตือน ถ้าว่าง กฎจะถูกบันทึกแต่ไม่ส่ง                      |
| `ALERT_CHECK_CRON`                       | `*/5 * * * *`                | รอบตรวจแจ้งเตือน (รูปแบบ cron)                                                      |
| `ALERTS_DB_PATH`                         | `server/data/alerts.sqlite`  | ที่เก็บกฎแจ้งเตือน (เมื่อไม่ได้ใช้ MySQL)                                           |
| `DATABASE_URL`                           | _(ว่าง)_                     | `mysql://user:pass@host:3306/db` ถ้าว่างใช้ไฟล์ SQLite                              |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`   | _(ว่าง)_                     | key ของ AI ที่ใช้สรุปข่าว (ใส่ค่ายเดียวพอ) ถ้าว่างทั้งคู่จะส่งแค่หัวข้อข่าว + ลิงก์ |
| `NEWS_AI_PROVIDER`                       | _(อัตโนมัติ)_                | `claude` หรือ `gemini` ว่างไว้ = ใช้ค่ายที่มี key                                   |
| `NEWS_DISCORD_WEBHOOK_URL`               | _(ว่าง)_                     | ห้อง Discord ของข่าว ถ้าว่างใช้ `DISCORD_WEBHOOK_URL`                               |
| `NEWS_CRON` / `NEWS_TIMEZONE`            | `0 7 * * *` / `Asia/Bangkok` | เวลาส่งสรุปข่าว                                                                     |
| `MYSQL_PASSWORD` / `MYSQL_ROOT_PASSWORD` | _(ว่าง)_                     | รหัสผ่าน MySQL — ใช้เฉพาะ Docker (ตัวอักษร/ตัวเลขเท่านั้น)                          |

## วิธีรัน

```bash
npm run dev
```

คำสั่งนี้รัน server และ client พร้อมกัน (ผ่าน `concurrently`)

- หน้าเว็บ: http://localhost:5173
- API: http://localhost:4000/api/health

ในโหมด dev, Vite จะส่งต่อ (proxy) คำขอ `/api/*` ไปที่ Express ให้เอง

### คำสั่งอื่น ๆ (รันที่ root)

| คำสั่ง                                           | ทำอะไร                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `npm test`                                       | รัน unit test ของ server และ client                                    |
| `npm run lint`                                   | ตรวจโค้ดด้วย ESLint                                                    |
| `npm run format` / `npm run format:check`        | จัดรูปแบบโค้ด / ตรวจรูปแบบด้วย Prettier                                |
| `npm run build`                                  | typecheck server และ build client เป็นไฟล์ production ใน `client/dist` |
| `npm --prefix server run news:once -- --dry-run` | ทดสอบสรุปข่าวทันที แสดงในหน้าจอ ไม่ส่ง Discord                         |

## รันด้วย Docker

ต้องมี [Docker Desktop](https://www.docker.com/products/docker-desktop/) — ระบบทั้งหมด (MySQL + server + หน้าเว็บ) รันด้วยคำสั่งเดียว

1. ใน `.env` ตั้ง `MYSQL_PASSWORD` และ `MYSQL_ROOT_PASSWORD` (ตัวอักษร/ตัวเลข) และ `GEMINI_API_KEY` (หรือ `ANTHROPIC_API_KEY`), `DISCORD_WEBHOOK_URL` ตามต้องการ
2. รัน

```bash
docker compose up -d --build          # สร้างและเปิดทุกอย่าง
docker compose logs -f server         # ดู log (ควรเห็น database: mysql และเวลาส่งข่าวครั้งถัดไป)
docker compose run --rm server npm run news:once -- --dry-run   # ทดสอบสรุปข่าวทันที
docker compose down                   # ปิด (ข้อมูลใน MySQL ยังอยู่)
```

- หน้าเว็บ: http://localhost:8080 (เปลี่ยนพอร์ตด้วย `WEB_PORT`)
- ข้อมูลกฎแจ้งเตือนและประวัติข่าวเก็บใน volume `mysql-data` — `docker compose down -v` = **ลบข้อมูลทั้งหมด**
- แก้ `shariah_list.json` แล้วต้อง `docker compose up -d --build server` ใหม่
- คู่มือฉบับเต็ม (สำรองข้อมูล, แก้ปัญหา): [`docs/docker-guide.md`](docs/docker-guide.md)
- กฎแจ้งเตือนเดิมในไฟล์ SQLite (`server/data/alerts.sqlite`) **ไม่ถูกย้ายไป MySQL อัตโนมัติ** — ถ้ามีกฎเดิม ให้สร้างใหม่ในหน้าเว็บ

## สรุปข่าวประจำวัน

ทุกวัน 07:00 น. เวลาไทย ส่ง "📰 สรุปข่าวประจำวัน | วันที่" เข้า Discord แบ่งหมวดด้วย emoji หมวดละ 2–3 ข่าวพร้อมลิงก์ต้นทาง
(ยาวเกิน 2,000 ตัวอักษรจะแบ่งเป็นหลายข้อความ) — ข่าวที่ส่งแล้วจะไม่ถูกส่งซ้ำในวันถัดไป
ถ้าฟีดไหนดึงไม่ได้จะข้ามไป และถ้าสรุปด้วย AI ไม่สำเร็จจะส่งหัวข้อข่าว + ลิงก์แทน

แหล่งข่าว วิธีเพิ่ม/ลบ และรายละเอียดการทำงาน: [`server/src/news/README.md`](server/src/news/README.md)

## วิธีแก้รายชื่อหุ้น

รายชื่อหุ้นอยู่ที่ [`server/data/shariah_list.json`](server/data/shariah_list.json)

```json
{
  "stocks": [
    {
      "symbol": "ADVANC.BK",
      "name": "Advanced Info Service",
      "market": "TH",
      "sector": "Telecommunications",
      "screenedBy": "ชื่อแหล่งที่คัดกรอง",
      "updatedAt": "2026-01-01"
    }
  ]
}
```

- `symbol` ต้องตรงกับ Yahoo Finance — **หุ้นไทยต้องลงท้ายด้วย `.BK`** (เช่น `PTTEP.BK`), หุ้นสหรัฐฯ ใช้ ticker ตรง ๆ (เช่น `MSFT`)
  ตรวจได้ที่ `https://finance.yahoo.com/quote/<SYMBOL>`
- `market` เป็น `TH` หรือ `US`, `updatedAt` รูปแบบ `YYYY-MM-DD`
- ใส่แหล่งที่มาจริงใน `screenedBy` — เมื่อไม่มีตัวไหนมีคำว่า "SAMPLE" แล้ว แบนเนอร์ "ข้อมูลตัวอย่าง" บนหน้าเว็บจะหายไปเอง
- แก้เสร็จแล้ว **รีสตาร์ต server** (server อ่านไฟล์ครั้งเดียวตอนเริ่ม) ถ้ารูปแบบไฟล์ผิด server จะบอกว่าฟิลด์ไหนผิด

รายละเอียดเพิ่มเติม: [`server/data/README.md`](server/data/README.md)

> ต้องการย้ายรายชื่อไปเก็บในฐานข้อมูลหรือดึงจาก API ภายนอก? เขียน class ใหม่ที่ implement
> interface `ShariahRepository` ใน `server/src/services/shariahService.ts` แล้วเปลี่ยนที่ `server/src/index.ts` จุดเดียว

## แจ้งเตือนราคาผ่าน Discord

1. สร้าง webhook ใน Discord แล้วใส่ใน `.env` เป็น `DISCORD_WEBHOOK_URL=...` — ไม่เคยใช้ Discord ดูทีละขั้นได้ที่
   [`docs/discord-webhook-setup.md`](docs/discord-webhook-setup.md)
2. รัน `npm run dev` ใหม่ ควรเห็นบรรทัด `[alerts] Discord webhook set, checking on schedule "*/5 * * * *"`
3. เปิดหน้าหุ้น (เช่น http://localhost:5173/stock/NVDA) เลื่อนลงไปที่การ์ด **แจ้งเตือนราคาผ่าน Discord**
   แล้วกด **ส่งข้อความทดสอบ** — ต้องมีข้อความเข้าห้อง Discord
4. เลือกเงื่อนไข ใส่ตัวเลข เลือกช่วงพัก แล้วกด **เพิ่มการแจ้งเตือน**

| เงื่อนไข          | แจ้งเมื่อ                              |
| ----------------- | -------------------------------------- |
| ราคาสูงกว่า X     | ราคาล่าสุด > X                         |
| ราคาต่ำกว่า X     | ราคาล่าสุด < X                         |
| วันนี้ขึ้นเกิน X% | % เปลี่ยนแปลงเทียบราคาปิดเมื่อวาน ≥ X  |
| วันนี้ลงเกิน X%   | % เปลี่ยนแปลงเทียบราคาปิดเมื่อวาน ≤ −X |

- **ช่วงพัก** (1 ชม. / 4 ชม. / 1 วัน) — หลังแจ้งแล้ว กฎเดิมจะไม่แจ้งซ้ำจนกว่าจะพ้นช่วงพัก และราคาต้องเป็นราคาใหม่
  (ช่วงตลาดปิด ราคาเดิมจะไม่ถูกแจ้งซ้ำทุกวัน)
- แก้ไขเงื่อนไข หรือปิดแล้วเปิดกฎใหม่ = เริ่มนับใหม่ อาจแจ้งทันทีในรอบถัดไปถ้ายังเข้าเงื่อนไข
- หน้า **แจ้งเตือน** (`/alerts`, ไอคอนกระดิ่งที่ header) รวมกฎทุกตัว พร้อมราคาปัจจุบัน และปุ่ม **ตรวจตอนนี้**
- กฎเก็บในไฟล์ `server/data/alerts.sqlite` (ไม่ขึ้น git) — ลบไฟล์นี้ = ลบกฎทั้งหมด
- รายละเอียดการทำงานและ API: [`server/src/alerts/README.md`](server/src/alerts/README.md)

> ⚠️ **แจ้งเตือนทำงานเฉพาะตอนที่ server รันอยู่** — ปิดคอมหรือปิด `npm run dev` = ไม่มีการตรวจราคา
> ถ้าต้องการให้ทำงานตลอด 24 ชม. ต้องรัน server บนเครื่องที่เปิดตลอด (VPS, Raspberry Pi ฯลฯ)

## ข้อจำกัดของข้อมูล

- **ราคาล่าช้า ~15 นาที** (หรือมากกว่า ขึ้นกับตลาด) — Yahoo Finance ไม่ได้ให้ราคา real-time ฟรี
  ราคาบนหน้าเว็บยังถูก cache ที่ server อีก 60 วินาที (quotes) และ 5 นาที (กราฟ)
- **ไม่ใช่ API ทางการ** — `yahoo-finance2` ดึงข้อมูลจาก endpoint ที่ Yahoo ไม่ได้รับรอง อาจเปลี่ยนหรือใช้ไม่ได้โดยไม่แจ้งล่วงหน้า
  และอาจโดนจำกัดจำนวนคำขอ (rate limit) ถ้าเรียกถี่เกินไป cache ฝั่ง server ช่วยลดปัญหานี้
- **ข้อมูลอาจขาดหรือผิด** — โดยเฉพาะ volume และแท่งของวันที่ยังไม่ปิดตลาด ถ้าบางตัวดึงไม่ได้ หน้าเว็บจะแสดง "—" พร้อมสาเหตุ แทนที่จะล้มทั้งหน้า
- **กราฟช่วง 5Y เป็นแท่งรายสัปดาห์** เส้น MA ในช่วงนี้จึงนับเป็นสัปดาห์ (เช่น MA200 = 200 สัปดาห์)
- **แจ้งเตือนอาจช้ากว่าราคาจริง** ราว 15–20 นาที (ราคาล่าช้า + รอบตรวจ 5 นาที) ไม่เหมาะกับการเทรดระยะสั้น
- **สถานะชาริอะห์ไม่ได้คำนวณจากระบบ** — แอปแสดงตามรายชื่อในไฟล์เท่านั้น ความถูกต้องขึ้นกับแหล่งที่คุณนำมาใส่

## API

| Endpoint                                    | คำอธิบาย                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                           | สถานะ server                                                                                                                        |
| `GET /api/stocks?market=TH\|US`             | รายชื่อหุ้นชาริอะห์ (กรองตลาดได้)                                                                                                   |
| `GET /api/quotes?symbols=A,B,C`             | ราคาล่าสุด สูงสุด 50 ตัวต่อคำขอ — ตัวที่ดึงไม่ได้จะมี `ok: false` และ `error` เฉพาะตัว                                              |
| `GET /api/history/:symbol?range=&interval=` | ข้อมูลแท่งเทียน `range`: `1mo` `3mo` `6mo` `1y` `2y` `5y` `10y` (ค่าเริ่มต้น `1y`), `interval`: `1d` `1wk` `1mo` (ค่าเริ่มต้น `1d`) |
| `/api/alerts` ...                           | จัดการกฎแจ้งเตือน, สถานะ, ส่งข้อความทดสอบ — ดู [`server/src/alerts/README.md`](server/src/alerts/README.md)                         |

error ทุกกรณีตอบเป็น JSON รูปแบบเดียวกัน:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [{ "path": "range", "message": "..." }]
  }
}
```

## โครงสร้างโปรเจกต์

```
├─ docker-compose.yml         MySQL + server + web (nginx)
├─ docs/                      คู่มือตั้งค่า Discord webhook
├─ shared/
│  ├─ types.ts                types ที่ใช้ร่วมกัน (Stock, Quote, Candle, AlertRule, ...)
│  └─ alerts.ts               ตรวจเงื่อนไขแจ้งเตือน (ใช้ทั้ง server และหน้าเว็บ)
├─ server/
│  ├─ Dockerfile
│  ├─ data/shariah_list.json  รายชื่อหุ้น (+ alerts.sqlite / news.sqlite เมื่อไม่ได้ใช้ MySQL)
│  ├─ src/
│  │  ├─ app.ts               ประกอบ Express app (รับ dependency จากภายนอก เพื่อให้ test ได้)
│  │  ├─ services/
│  │  │  ├─ priceService.ts   ดึงราคาจาก Yahoo + cache — ใช้ร่วมกันระหว่าง API และระบบแจ้งเตือน
│  │  │  └─ shariahService.ts โหลดรายชื่อหุ้น
│  │  ├─ routes/              stocks, quotes, history, alerts, health
│  │  ├─ lib/                 cache, error handling
│  │  ├─ db/                  เลือกฐานข้อมูล: MySQL (DATABASE_URL) หรือ SQLite
│  │  ├─ alerts/              เก็บกฎ (MySQL/SQLite), ส่ง Discord, ตรวจตามรอบ (node-cron)
│  │  └─ news/                สรุปข่าวประจำวัน: RSS → Claude → Discord (07:00 ทุกวัน)
│  └─ test/                   cache, API routes, alerts, news, MySQL (ถ้าตั้ง TEST_MYSQL_URL)
└─ client/src/               (Dockerfile + nginx.conf อยู่ที่ client/)
   ├─ pages/                  Dashboard, StockDetail, Alerts
   ├─ components/             ตาราง, กราฟ, การ์ด, ฟอร์ม/รายการแจ้งเตือน, layout
   ├─ api/client.ts           fetch + TanStack Query hooks
   ├─ lib/                    คำนวณ MA, กรอง/เรียงตาราง, ข้อความแจ้งเตือน, จัดรูปแบบตัวเลข
   └─ test/                   unit tests
```
