import type { DigestSection } from './summarizer.js';

/** Discord รับข้อความ (content) ได้ไม่เกิน 2,000 ตัวอักษร */
export const DISCORD_MAX_CHARS = 2000;

export type DigestMode = 'ai' | 'headlines';

/** วันที่แบบไทย เช่น "29 ตุลาคม 2569" ตามเขตเวลาที่กำหนด */
export function formatThaiDate(date: Date, timeZone = 'Asia/Bangkok'): string {
  return date.toLocaleDateString('th-TH', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** กันอักขระที่ Discord ใช้จัดรูปแบบ (*, _, ~ ฯลฯ) ไม่ให้หัวข้อข่าวกลายเป็นตัวหนา/ขีดเส้น */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>[\]])/g, '\\$1');
}

function itemLine(text: string, source: string, link: string): string {
  // ครอบลิงก์ด้วย <> เพื่อไม่ให้ Discord แสดงกล่องพรีวิวทุกลิงก์จนรก
  return `• ${escapeMarkdown(text)} — [${escapeMarkdown(source)}](<${link}>)`;
}

/** หน่วยข้อความที่ห้ามตัดกลาง (หัวข้อหมวด + ข่าวแรก, ข่าวแต่ละข้อ) */
interface Unit {
  text: string;
  /** หัวหมวดที่ใช้ซ้ำ ถ้าข่าวนี้ต้องย้ายไปขึ้นข้อความใหม่ */
  continuedHeading?: string;
}

/**
 * สร้างข้อความสรุปข่าว แบ่งเป็นหลายข้อความถ้ายาวเกิน 2,000 ตัวอักษร
 * โดยไม่ตัดกลางข่าว และถ้าหมวดไหนถูกแบ่ง ข้อความถัดไปจะขึ้นชื่อหมวด "(ต่อ)"
 */
export function buildDigestMessages(
  sections: DigestSection[],
  { date, mode, timeZone = 'Asia/Bangkok' }: { date: Date; mode: DigestMode; timeZone?: string },
): string[] {
  const units: Unit[] = [];

  let header = `📰 **สรุปข่าวประจำวัน | ${formatThaiDate(date, timeZone)}**`;
  if (mode === 'headlines') {
    header += '\n⚠️ วันนี้สรุปด้วย AI ไม่สำเร็จ จึงแสดงเฉพาะหัวข้อข่าวพร้อมลิงก์';
  }
  units.push({ text: header });

  const nonEmpty = sections.filter((s) => s.items.length > 0);
  if (nonEmpty.length === 0) {
    units.push({ text: '\nไม่มีข่าวใหม่ตั้งแต่สรุปครั้งก่อน' });
  }

  for (const { category, items } of nonEmpty) {
    const heading = `${category.emoji} **${category.title}**`;
    items.forEach(({ text, article }, i) => {
      const line = itemLine(text, article.source, article.link);
      units.push(
        i === 0
          ? { text: `\n${heading}\n${line}` }
          : { text: line, continuedHeading: `${heading} (ต่อ)` },
      );
    });
  }

  units.push({
    text:
      mode === 'ai'
        ? '\n-# สรุปโดย AI อาจคลาดเคลื่อน ตรวจสอบจากลิงก์ต้นทาง · ไม่ใช่คำแนะนำการลงทุน'
        : '\n-# ไม่ใช่คำแนะนำการลงทุน',
  });

  // ใส่ทีละหน่วยจนกว่าจะเต็ม 2,000 ตัวอักษร แล้วเริ่มข้อความใหม่
  const messages: string[] = [];
  let current = '';
  for (const unit of units) {
    const joined = current ? `${current}\n${unit.text}` : unit.text;
    if (joined.length <= DISCORD_MAX_CHARS) {
      current = joined;
      continue;
    }
    if (current) messages.push(current);
    const fresh = unit.continuedHeading ? `${unit.continuedHeading}\n${unit.text}` : unit.text;
    current = fresh.trimStart().slice(0, DISCORD_MAX_CHARS); // กันกรณีข่าวเดียวยาวเกิน (แทบไม่เกิดขึ้น)
  }
  if (current) messages.push(current);
  return messages;
}
