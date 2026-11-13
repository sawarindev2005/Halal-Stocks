/**
 * โหมดทดสอบ: รันสรุปข่าว 1 รอบทันที ไม่ต้องรอ 07:00
 *
 *   npm --prefix server run news:once              ดึงข่าว + สรุป + ส่งเข้า Discord จริง
 *   npm --prefix server run news:once -- --dry-run แสดงข้อความในหน้าจอ ไม่ส่ง และไม่บันทึกประวัติ
 */
import { loadConfig } from '../config.js';
import { openRepositories } from '../db/index.js';
import { JsonFileShariahRepository } from '../services/shariahService.js';
import { createNewsDigestFromConfig } from './index.js';
import { logDigestResult } from './scheduler.js';

const dryRun = process.argv.includes('--dry-run');

const config = loadConfig();
const repos = await openRepositories(config);

try {
  const { job, webhookConfigured, aiLabel } = createNewsDigestFromConfig(config, {
    repo: repos.news,
    shariah: new JsonFileShariahRepository(),
  });
  console.log(
    `[news] running once${dryRun ? ' (dry run — nothing is sent)' : ''} · database: ${repos.kind}` +
      ` · AI: ${aiLabel}` +
      ` · Discord: ${webhookConfigured ? 'set' : 'not set'}`,
  );

  const result = await job.runOnce({ dryRun });

  if (dryRun) {
    result.messages.forEach((m, i) => {
      console.log(
        `\n───── ข้อความที่ ${i + 1}/${result.messages.length} (${m.length} ตัวอักษร) ─────\n${m}`,
      );
    });
    console.log();
  }
  logDigestResult(result);
  process.exitCode = result.sendError || result.skippedReason ? 1 : 0;
} finally {
  await repos.close();
}
