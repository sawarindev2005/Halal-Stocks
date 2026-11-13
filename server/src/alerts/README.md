# alerts/ — แจ้งเตือนราคาผ่าน Discord

| ไฟล์                  | หน้าที่                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `alertRepository.ts`  | เก็บกฎใน SQLite (`node:sqlite` ที่มากับ Node) ไฟล์ `server/data/alerts.sqlite` — ใช้ `:memory:` ใน test |
| `discordNotifier.ts`  | ส่งข้อความไป webhook (retry 1 ครั้งเมื่อโดน rate limit) + จัดรูปแบบข้อความภาษาไทย                       |
| `alertChecker.ts`     | ตรวจกฎทั้งหมดหนึ่งรอบ: ดึงราคาผ่าน `PriceService` (cache เดียวกับ API) → ตรวจเงื่อนไข → ส่ง → บันทึก    |
| `scheduler.ts`        | รัน checker ตาม cron (`ALERT_CHECK_CRON`, ค่าเริ่มต้นทุก 5 นาที)                                        |
| `../routes/alerts.ts` | API `/api/alerts`                                                                                       |

## เงื่อนไข

| `condition`   | แจ้งเมื่อ                          |
| ------------- | ---------------------------------- |
| `price_above` | ราคา > `threshold`                 |
| `price_below` | ราคา < `threshold`                 |
| `change_up`   | % เปลี่ยนแปลงวันนี้ ≥ `threshold`  |
| `change_down` | % เปลี่ยนแปลงวันนี้ ≤ −`threshold` |

## กันแจ้งซ้ำ

กฎหนึ่งจะแจ้งอีกครั้งได้ก็ต่อเมื่อ **ทั้งสองข้อ** เป็นจริง

1. ผ่านช่วงพัก (`cooldownMinutes`) นับจากครั้งล่าสุดแล้ว
2. ราคาที่ได้ใหม่กว่าราคาที่แจ้งครั้งก่อน (`marketTime` ใหม่กว่า) — ตลาดปิดช่วงสุดสัปดาห์จะไม่โดนแจ้งราคาเดิมซ้ำทุกวัน

ถ้าแก้เงื่อนไข/ตัวเลข หรือปิดแล้วเปิดกฎใหม่ ประวัติการแจ้งจะถูกล้าง กฎเริ่มนับใหม่
ถ้าส่ง Discord ไม่สำเร็จ จะไม่บันทึกว่าแจ้งแล้ว รอบถัดไปจะลองใหม่

## API

| Endpoint                  | คำอธิบาย                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/alerts?symbol=` | รายการกฎ                                                                        |
| `POST /api/alerts`        | เพิ่มกฎ `{ symbol, condition, threshold, cooldownMinutes? }` (ค่าเริ่มต้น 1440) |
| `PATCH /api/alerts/:id`   | แก้ `condition` `threshold` `cooldownMinutes` `active`                          |
| `DELETE /api/alerts/:id`  | ลบกฎ                                                                            |
| `GET /api/alerts/status`  | ตั้ง webhook แล้วหรือยัง, รอบถัดไป, ผลรอบล่าสุด                                 |
| `POST /api/alerts/test`   | ส่งข้อความทดสอบเข้า Discord                                                     |
| `POST /api/alerts/check`  | ตรวจทันทีโดยไม่ต้องรอรอบ                                                        |

symbol ต้องอยู่ใน `shariah_list.json` และมีกฎได้สูงสุด 200 กฎ
