import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { errorMessage } from '../lib/errors.js';
import type { Article } from './feedFetcher.js';
import {
  buildPrompt,
  DigestSchema,
  SYSTEM_PROMPT,
  toSections,
  type Summarizer,
} from './summarizer.js';

/** รุ่น Flash: เร็ว ถูก และมีโควตาฟรี (alias `gemini-flash-latest` เคยค้างนานจน timeout จึงระบุรุ่นตรง ๆ) */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
/** ถ้ารุ่นหลักยังไม่ว่าง (เช่น 503 คนใช้เยอะ) หลังลองซ้ำครบแล้ว ให้ลองรุ่นนี้ก่อนยอมส่งแค่หัวข้อข่าว */
export const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash-lite';

// ลองใหม่อัตโนมัติเมื่อเจอ 408/429/5xx: รอ 5, 10, 20 วินาที (รวมสูงสุด 4 ครั้ง)
const RETRY_OPTIONS = { attempts: 4, initialDelay: 5, maxDelay: 30 };

// แปลง schema (zod) เป็น JSON Schema ให้ Gemini บังคับรูปแบบคำตอบ — ใช้ schema เดียวกับ Claude
const RESPONSE_SCHEMA = z.toJSONSchema(DigestSchema);

export interface GeminiSummarizerOptions {
  apiKey: string;
  model?: string;
  /** รุ่นสำรอง (ใส่ null เพื่อปิด) */
  fallbackModel?: string | null;
  /** ส่ง client ปลอมเข้ามาได้ตอน test */
  client?: Pick<GoogleGenAI, 'models'>;
}

/** สรุปข่าวด้วย Gemini API (Google AI Studio) — ใช้ prompt และกติกาเดียวกับตัว Claude */
export function createGeminiSummarizer({
  apiKey,
  model = DEFAULT_GEMINI_MODEL,
  fallbackModel = FALLBACK_GEMINI_MODEL,
  client = new GoogleGenAI({ apiKey }),
}: GeminiSummarizerOptions): Summarizer {
  return {
    async summarize(input) {
      const withArticles = input.filter((c) => c.articles.length > 0);
      if (withArticles.length === 0) return [];

      const ids = new Map<string, Article>();
      const prompt = buildPrompt(withArticles, ids);

      const generate = (m: string) =>
        client.models.generateContent({
          model: m,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseJsonSchema: RESPONSE_SCHEMA,
            // งานสรุปข่าวไม่ซับซ้อน ให้คิดน้อยเพื่อให้เร็วและไม่ timeout
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            httpOptions: { timeout: 120_000, retryOptions: RETRY_OPTIONS },
          },
        });

      let response: Awaited<ReturnType<typeof generate>>;
      try {
        response = await generate(model);
      } catch (err) {
        if (!fallbackModel || fallbackModel === model) throw err;
        console.log(`[news] ${model} failed (${errorMessage(err)}), trying ${fallbackModel}`);
        response = await generate(fallbackModel);
      }

      const finish = response.candidates?.[0]?.finishReason;
      if (finish && finish !== 'STOP') {
        throw new Error(`Gemini stopped early (${finish})`);
      }
      const text = response.text;
      if (!text) throw new Error('Gemini returned an empty response');

      // ตรวจคำตอบด้วย zod อีกชั้น ถ้าผิดรูปแบบจะ throw แล้วระบบเปลี่ยนไปส่งหัวข้อข่าวแทน
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Gemini returned invalid JSON');
      }
      const parsed = DigestSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error('Gemini returned a response that did not match the schema');
      }
      return toSections(parsed.data, ids, withArticles);
    },
  };
}
