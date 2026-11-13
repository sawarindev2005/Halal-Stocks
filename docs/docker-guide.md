# คู่มือรัน Shariah Stock Watch ด้วย Docker

คู่มือนี้สำหรับคนที่ไม่เคยใช้ Docker มาก่อน ทำตามครั้งแรกใช้เวลาประมาณ 20 นาที (ส่วนใหญ่คือรอดาวน์โหลด)

**Docker คืออะไร:** โปรแกรมที่รันแอปไว้ใน "กล่อง" (container) ที่มีทุกอย่างที่แอปต้องใช้อยู่ข้างในครบ
คุณไม่ต้องติดตั้ง Node.js หรือ MySQL ในเครื่องเอง แค่มี Docker ก็สั่งเปิดทั้งระบบได้ด้วยคำสั่งเดียว

---

## ระบบมีอะไรบ้าง

```
เบราว์เซอร์ ──► web (nginx) ──/api──► server (Node) ──► mysql
  :8080         หน้าเว็บ              API + แจ้งเตือนราคา    เก็บกฎแจ้งเตือน
                                      + สรุปข่าว 07:00      + ประวัติข่าวที่ส่งแล้ว
```

| กล่อง (service) | ทำอะไร                                                                                |
| --------------- | ------------------------------------------------------------------------------------- |
| `mysql`         | ฐานข้อมูล ข้อมูลเก็บใน volume ชื่อ `mysql-data` จึงไม่หายแม้ปิดหรือลบกล่อง            |
| `server`        | API ของหน้าเว็บ, ตรวจราคาแจ้งเตือนทุก 5 นาที, ส่งสรุปข่าวเข้า Discord ทุกวัน 07:00 น. |
| `web`           | หน้าเว็บที่ http://localhost:8080 และส่งต่อคำขอ `/api` ไปที่ `server`                 |

ทั้ง 3 กล่องตั้งให้เปิดตัวเองใหม่อัตโนมัติถ้าล่ม หรือเมื่อ Docker Desktop เปิดขึ้นมา (ยกเว้นคุณสั่งปิดเอง)

ไฟล์ที่เกี่ยวข้อง: `docker-compose.yml` (กำหนดทั้งระบบ), `server/Dockerfile`, `client/Dockerfile`, `client/nginx.conf`

---

## ขั้นที่ 1: ติดตั้ง Docker Desktop

1. ดาวน์โหลดจาก https://www.docker.com/products/docker-desktop/ แล้วติดตั้ง (ใช้ค่าเริ่มต้นได้เลย)
2. รีสตาร์ตเครื่องถ้าตัวติดตั้งขอ
3. เปิด **Docker Desktop** รอจนมุมซ้ายล่างขึ้นว่า **Engine running** (ไอคอนวาฬที่ taskbar หยุดขยับ)
4. ตรวจใน PowerShell:

```powershell
docker --version
docker compose version
```

ถ้าขึ้นเลขเวอร์ชันทั้งสองบรรทัด แปลว่าพร้อมแล้ว

> **ให้เปิดเองตอนเปิดคอม:** Docker Desktop → ⚙️ Settings → General → เปิด **Start Docker Desktop when you sign in to your computer**
> ระบบแจ้งเตือนและสรุปข่าวจะกลับมาทำงานเองหลังเปิดเครื่อง

## ขั้นที่ 2: ตั้งค่าในไฟล์ `.env`

เปิดไฟล์ `.env` ที่โฟลเดอร์หลักของโปรเจกต์ (`D:\Claude-code\Halal_Stocks\.env`) — ถ้ายังไม่มี ให้คัดลอกจาก `.env.example`

```powershell
Copy-Item .env.example .env
```

ค่าที่ต้องมี:

| ตัวแปร                     | จำเป็นไหม  | คำอธิบาย                                                                                |
| -------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `MYSQL_PASSWORD`           | **ต้องมี** | รหัสผ่านของแอปที่ใช้เข้า MySQL — ตั้งเองได้ ใช้แค่ตัวอักษรกับตัวเลข                     |
| `MYSQL_ROOT_PASSWORD`      | **ต้องมี** | รหัสผ่านผู้ดูแล MySQL — ตั้งเอง ให้ต่างจากอันบน                                         |
| `DISCORD_WEBHOOK_URL`      | แนะนำ      | ห้องที่รับแจ้งเตือนราคา — ดู [discord-webhook-setup.md](discord-webhook-setup.md)       |
| `NEWS_DISCORD_WEBHOOK_URL` | ไม่บังคับ  | ห้องที่รับสรุปข่าว ถ้าว่างจะส่งข่าวเข้าห้องเดียวกับแจ้งเตือนราคา                        |
| `GEMINI_API_KEY`           | แนะนำ      | สำหรับสรุปข่าวเป็นภาษาไทย จาก https://aistudio.google.com (หรือใช้ `ANTHROPIC_API_KEY`) |
| `WEB_PORT`                 | ไม่บังคับ  | พอร์ตหน้าเว็บ ค่าเริ่มต้น `8080`                                                        |

ตัวอย่าง:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...ห้องแจ้งเตือนราคา...
NEWS_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...ห้องข่าว...
GEMINI_API_KEY=...
MYSQL_PASSWORD=Xk7pQ2mN9vR4
MYSQL_ROOT_PASSWORD=Hb3wT8zL5cY1
```

> ⚠️ **ตั้งรหัสผ่าน MySQL ให้เรียบร้อยก่อนเปิดครั้งแรก** MySQL จะจำรหัสผ่านตั้งแต่ครั้งแรกที่สร้างฐานข้อมูล
> ถ้ามาเปลี่ยนใน `.env` ทีหลัง server จะเข้าฐานข้อมูลไม่ได้ — ดูวิธีแก้ใน [แก้ปัญหา](#แก้ปัญหา)

> ไฟล์ `.env` อยู่ใน `.gitignore` แล้ว รหัสผ่านและ key จึงไม่ถูก commit ขึ้น git

## ขั้นที่ 3: เปิดระบบ

เปิด PowerShell ที่โฟลเดอร์โปรเจกต์ แล้วรัน

```powershell
cd D:\Claude-code\Halal_Stocks
docker compose up -d --build
```

- `up` = เปิดระบบ, `-d` = รันเบื้องหลัง (ปิดหน้าต่าง PowerShell ได้), `--build` = สร้างกล่องจากโค้ดล่าสุด
- ครั้งแรกใช้เวลาหลายนาที (ดาวน์โหลด MySQL, Node, nginx และ build หน้าเว็บ) ครั้งต่อไปเร็วขึ้นมาก

เมื่อเสร็จจะเห็นบรรทัดลงท้ายด้วย `Started` ครบทั้ง `mysql`, `server`, `web`

## ขั้นที่ 4: ตรวจว่าทำงานปกติ

```powershell
docker compose ps
```

ควรเห็นทั้ง 3 ตัวเป็น `Up` และ `mysql` เป็น `(healthy)`

```powershell
docker compose logs server
```

ควรเห็น 3 บรรทัดนี้

```
[server] listening on http://localhost:4000 (CORS: http://localhost:8080, database: mysql)
[alerts] Discord webhook set, checking on schedule "*/5 * * * *"
[news] daily digest on "0 7 * * *" (Asia/Bangkok), next: ...T00:00:00.000Z, AI: Gemini (gemini-3.5-flash)
```

> เวลา `next:` แสดงเป็นเวลาสากล (UTC) — `00:00` UTC คือ **07:00 เวลาไทย**

จากนั้นเปิด http://localhost:8080 ในเบราว์เซอร์ ควรเห็นตารางรายชื่อหุ้น

## ขั้นที่ 5: ทดสอบสรุปข่าวโดยไม่ต้องรอ 07:00

แสดงผลในหน้าจออย่างเดียว ไม่ส่ง Discord และไม่บันทึกประวัติ:

```powershell
docker compose run --rm server npm run news:once -- --dry-run
```

บรรทัดท้ายควรเป็น `mode ai` (สรุปด้วย AI สำเร็จ) ถ้าเป็น `mode headlines` บรรทัดถัดไปจะบอกสาเหตุ

ส่งเข้า Discord จริง 1 รอบ:

```powershell
docker compose run --rm server npm run news:once
```

> ข่าวที่ส่งจริงแล้วจะถูกจำไว้ รอบ 07:00 ของพรุ่งนี้จะไม่ส่งข่าวเดิมซ้ำ

---

## คำสั่งที่ใช้ประจำ

รันที่โฟลเดอร์โปรเจกต์ทุกคำสั่ง

| อยากทำอะไร                                   | คำสั่ง                          |
| -------------------------------------------- | ------------------------------- |
| เปิดระบบ                                     | `docker compose up -d`          |
| ดูสถานะ                                      | `docker compose ps`             |
| ดู log ของ server แบบสด (กด Ctrl+C เพื่อออก) | `docker compose logs -f server` |
| ดู log 50 บรรทัดล่าสุดของทุกกล่อง            | `docker compose logs --tail 50` |
| รีสตาร์ต server                              | `docker compose restart server` |
| ปิดระบบ (ข้อมูลยังอยู่)                      | `docker compose down`           |
| ⚠️ ปิดระบบและ **ลบข้อมูลทั้งหมด**            | `docker compose down -v`        |

## เมื่อแก้ไขอะไรแล้วต้องทำอะไรต่อ

| แก้อะไร                                                  | รันคำสั่ง                             |
| -------------------------------------------------------- | ------------------------------------- |
| ค่าใน `.env` (เช่น key, webhook)                         | `docker compose up -d`                |
| รายชื่อหุ้น `server/data/shariah_list.json`              | `docker compose up -d --build server` |
| แหล่งข่าว `server/src/news/feeds.ts` หรือโค้ดฝั่ง server | `docker compose up -d --build server` |
| หน้าเว็บ (`client/`)                                     | `docker compose up -d --build web`    |
| ไม่แน่ใจ                                                 | `docker compose up -d --build`        |

> `up -d` เฉย ๆ จะสร้างกล่องใหม่เฉพาะตัวที่การตั้งค่าเปลี่ยน ส่วน `--build` จะอ่านโค้ดล่าสุดเข้าไปในกล่องด้วย

---

## สำรองและกู้คืนข้อมูล

ข้อมูลใน MySQL คือกฎแจ้งเตือนทั้งหมดและประวัติข่าวที่ส่งแล้ว ควรสำรองก่อนทำอะไรเสี่ยง เช่น `down -v` หรือย้ายเครื่อง

**สำรอง** (ได้ไฟล์ `backup.sql` ในโฟลเดอร์โปรเจกต์):

```powershell
docker compose exec mysql sh -c 'mysqldump -uroot -p$MYSQL_ROOT_PASSWORD --no-tablespaces shariah_watch --result-file=/tmp/backup.sql'
docker compose cp mysql:/tmp/backup.sql ./backup.sql
```

**กู้คืน** จากไฟล์ `backup.sql` (ข้อมูลปัจจุบันในตารางจะถูกแทนที่):

```powershell
docker compose cp ./backup.sql mysql:/tmp/restore.sql
docker compose exec mysql sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD shariah_watch < /tmp/restore.sql'
```

> ขึ้นข้อความ `Using a password on the command line interface can be insecure` เป็นเรื่องปกติ ไม่ใช่ error

**ดูข้อมูลในฐานข้อมูล:**

```powershell
'SELECT * FROM alerts; SELECT COUNT(*) AS sent_news FROM sent_news;' | docker compose exec -T mysql sh -c 'mysql -ushariah -p$MYSQL_PASSWORD -t shariah_watch'
```

> กฎแจ้งเตือนที่สร้างตอนรันแบบ `npm run dev` อยู่ในไฟล์ SQLite (`server/data/alerts.sqlite`) **ไม่ได้ย้ายมา MySQL อัตโนมัติ**
> ถ้าต้องการใช้ต่อ ให้สร้างใหม่ในหน้าเว็บ

---

## Docker กับ `npm run dev` ต่างกันอย่างไร

|             | `npm run dev`                | Docker                              |
| ----------- | ---------------------------- | ----------------------------------- |
| หน้าเว็บ    | http://localhost:5173        | http://localhost:8080               |
| ฐานข้อมูล   | ไฟล์ SQLite ใน `server/data` | MySQL ใน volume `mysql-data`        |
| แก้โค้ดแล้ว | เห็นผลทันที                  | ต้อง `docker compose up -d --build` |
| เหมาะกับ    | ตอนพัฒนา/แก้โค้ด             | ใช้งานจริงทุกวัน                    |

> **อย่าเปิดทั้งสองแบบพร้อมกัน** แต่ละแบบมีตัวตรวจราคาของตัวเอง ถ้าเปิดคู่กัน Discord อาจได้แจ้งเตือนซ้ำ

> ⚠️ ระบบทำงานเฉพาะตอนที่คอมเปิดและ Docker Desktop รันอยู่ ถ้าคอม Sleep หรือปิดอยู่ตอน 07:00 ระบบจะ**ส่งสรุปข่าวย้อนหลังทันทีที่คอมกลับมาทำงาน** (ภายใน 10 นาที) ถ้ายังเป็นวันเดียวกัน
> ถ้าไม่อยากให้ข่าวมาช้า ให้ตั้งคอมไม่ให้ Sleep: Settings → System → Power → Screen, sleep & hibernate timeouts → ตั้ง sleep เป็น **Never** ตอนเสียบปลั๊ก
> ถ้าต้องการให้ทำงานตลอด 24 ชม. ต้องย้ายไปรันบนเครื่องที่เปิดตลอด (VPS, Raspberry Pi ฯลฯ) ด้วยคำสั่งชุดเดียวกันนี้

---

## แก้ปัญหา

| อาการ                                                                                     | สาเหตุ / วิธีแก้                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `failed to connect to the docker API ... dockerDesktopLinuxEngine`                        | Docker Desktop ยังไม่เปิด เปิดโปรแกรมแล้วรอจนขึ้น **Engine running** แล้วรันใหม่                                                                                                                                                          |
| `required variable MYSQL_PASSWORD is missing` หรือ `ตั้ง MYSQL_PASSWORD ในไฟล์ .env ก่อน` | ยังไม่ได้ใส่ `MYSQL_PASSWORD` / `MYSQL_ROOT_PASSWORD` ใน `.env` (ขั้นที่ 2) หรือรันคำสั่งนอกโฟลเดอร์โปรเจกต์                                                                                                                              |
| `Bind for 0.0.0.0:8080 failed: port is already allocated`                                 | มีโปรแกรมอื่นใช้พอร์ต 8080 อยู่ ใส่ `WEB_PORT=8081` ใน `.env` แล้ว `docker compose up -d` จากนั้นเปิด http://localhost:8081                                                                                                               |
| log ของ server ขึ้น `Access denied for user 'shariah'` หรือ `Could not connect to MySQL`  | เปลี่ยน `MYSQL_PASSWORD` หลังจากสร้างฐานข้อมูลไปแล้ว ให้เปลี่ยนกลับเป็นค่าเดิม — หรือถ้ายอมเริ่มฐานข้อมูลใหม่ (กฎแจ้งเตือนหาย) ให้ [สำรองข้อมูล](#สำรองและกู้คืนข้อมูล) ก่อน แล้ว `docker compose down -v` ตามด้วย `docker compose up -d` |
| `server` ขึ้น `Restarting` วนไปเรื่อย ๆ                                                   | ดูสาเหตุด้วย `docker compose logs server` มักเป็นค่าใน `.env` ผิดรูปแบบ (log จะบอกชื่อตัวแปร) แก้แล้ว `docker compose up -d`                                                                                                              |
| หน้าเว็บเปิดได้แต่ไม่มีราคา / ขึ้น error                                                  | server ยังเปิดไม่เสร็จหรือล่ม ดู `docker compose ps` และ `docker compose logs server`                                                                                                                                                     |
| สรุปข่าวขึ้น `mode headlines` และ `503 ... high demand`                                   | Gemini คนใช้เยอะชั่วคราว ระบบลองซ้ำและลองรุ่นสำรองให้แล้ว ลองรันใหม่ภายหลังได้                                                                                                                                                            |
| สรุปข่าวขึ้น `API key not valid` หรือ `401` / `403`                                       | key ผิดหรือถูกลบไปแล้ว สร้าง key ใหม่ แก้ใน `.env` แล้ว `docker compose up -d`                                                                                                                                                            |
| แก้ `.env` แล้วไม่มีผล                                                                    | ต้องรัน `docker compose up -d` หลังแก้ทุกครั้ง (`restart` อย่างเดียวไม่อ่าน `.env` ใหม่)                                                                                                                                                  |
| แก้รายชื่อหุ้นแล้วหน้าเว็บไม่เปลี่ยน                                                      | ไฟล์ถูก copy เข้ากล่องตอน build ต้องรัน `docker compose up -d --build server`                                                                                                                                                             |
| ดิสก์เต็ม                                                                                 | ลบ image เก่าที่ไม่ใช้ด้วย `docker image prune` (ไม่กระทบข้อมูลใน MySQL)                                                                                                                                                                  |
