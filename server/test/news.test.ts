import { describe, expect, it, vi } from 'vitest';
import type { DiscordMessage, Notifier } from '../src/alerts/discordNotifier.js';
import { createNewsDigestJob } from '../src/news/digestJob.js';
import { buildDigestMessages, DISCORD_MAX_CHARS } from '../src/news/digestMessage.js';
import {
  articleKey,
  createFeedFetcher,
  normalizeLink,
  type Article,
  type FeedFetcher,
} from '../src/news/feedFetcher.js';
import { newsCategories, yahooSymbolFeeds, type NewsCategory } from '../src/news/feeds.js';
import { createGeminiSummarizer } from '../src/news/geminiSummarizer.js';
import { SqliteNewsRepository } from '../src/news/newsRepository.js';
import {
  createClaudeSummarizer,
  headlinesOnly,
  type CategoryArticles,
  type Summarizer,
} from '../src/news/summarizer.js';

const NOW = new Date('2026-10-29T00:00:00.000Z'); // 07:00 เวลาไทย

const MARKETS: NewsCategory = {
  id: 'markets',
  emoji: '📈',
  title: 'ตลาดหุ้นและการเงิน',
  feeds: [
    { name: 'Feed A', url: 'https://a.example/rss' },
    { name: 'Feed B', url: 'https://b.example/rss' },
  ],
};
const TECH: NewsCategory = {
  id: 'tech',
  emoji: '💻',
  title: 'เทคโนโลยี',
  feeds: [{ name: 'Tech', url: 'https://t.example/rss' }],
};

function rss(items: { title: string; link: string; date?: string }[]): string {
  const body = items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link>${i.date ? `<pubDate>${i.date}</pubDate>` : ''}<description>about ${i.title}</description></item>`,
    )
    .join('');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${body}</channel></rss>`;
}

function article(n: number, categoryId: Article['categoryId'] = 'markets'): Article {
  const link = `https://news.example/${categoryId}/${n}`;
  return {
    key: articleKey(link),
    categoryId,
    title: `Headline ${n}`,
    link,
    source: 'Feed A',
    publishedAt: NOW.toISOString(),
    snippet: '',
  };
}

describe('normalizeLink / articleKey', () => {
  it('ignores tracking parameters, hashes and trailing slashes', () => {
    expect(normalizeLink('https://Example.com/a/?utm_source=x&id=7#top')).toBe(
      'https://example.com/a?id=7',
    );
    expect(articleKey('https://example.com/a/?.tsrc=rss')).toBe(
      articleKey('https://example.com/a'),
    );
  });
});

describe('feeds', () => {
  it('splits Yahoo symbol feeds into chunks of 10', () => {
    const symbols = Array.from({ length: 25 }, (_, i) => `S${i}`);
    const feeds = yahooSymbolFeeds(symbols);
    expect(feeds).toHaveLength(3);
    expect(feeds[0]!.url).toContain('s=S0,S1,');
    expect(newsCategories(['AAPL'])[0]!.feeds[0]!.url).toContain('s=AAPL');
  });
});

describe('createFeedFetcher', () => {
  it('keeps recent items, skips old/undated/duplicate ones, and survives a failing feed', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).startsWith('https://b.example')) return new Response('nope', { status: 404 });
      return new Response(
        rss([
          { title: 'Fresh', link: 'https://x.example/1', date: 'Wed, 28 Oct 2026 20:00:00 GMT' },
          {
            title: 'Fresh again',
            link: 'https://x.example/1?utm_source=rss',
            date: 'Wed, 28 Oct 2026 21:00:00 GMT',
          },
          { title: 'Old', link: 'https://x.example/2', date: 'Mon, 26 Oct 2026 08:00:00 GMT' },
          { title: 'No date', link: 'https://x.example/3' },
        ]),
      );
    });
    const fetcher = createFeedFetcher({ fetchFn: fetchFn as typeof fetch, wait: async () => {} });

    const { articles, errors } = await fetcher.fetchCategory(
      MARKETS,
      new Date('2026-10-28T00:00:00Z'),
    );

    expect(articles.map((a) => a.title)).toEqual(['Fresh']);
    expect(articles[0]).toMatchObject({ categoryId: 'markets', source: 'Feed A' });
    expect(errors).toEqual([
      { source: 'Feed B', url: 'https://b.example/rss', message: 'HTTP 404' },
    ]);
  });

  it('retries once when the feed answers 429', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () =>
      ++calls === 1
        ? new Response('slow down', { status: 429 })
        : new Response(
            rss([{ title: 'Ok', link: 'https://x.example/ok', date: NOW.toUTCString() }]),
          ),
    );
    const fetcher = createFeedFetcher({ fetchFn: fetchFn as typeof fetch, wait: async () => {} });

    const { articles, errors } = await fetcher.fetchCategory(TECH, new Date(NOW.getTime() - 1000));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(articles).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});

describe('buildDigestMessages', () => {
  it('starts with the dated title and groups items under category emoji', () => {
    const [msg] = buildDigestMessages(
      [{ category: MARKETS, items: [{ text: 'สรุป *ข่าว*', article: article(1) }] }],
      { date: NOW, mode: 'ai' },
    );
    expect(msg).toMatch(/^📰 \*\*สรุปข่าวประจำวัน \| 29 ตุลาคม 2569\*\*/);
    expect(msg).toContain('📈 **ตลาดหุ้นและการเงิน**');
    expect(msg).toContain('• สรุป \\*ข่าว\\* — [Feed A](<https://news.example/markets/1>)');
  });

  it('splits into messages of at most 2,000 characters without cutting an item', () => {
    const long = 'ก'.repeat(250);
    const items = Array.from({ length: 12 }, (_, i) => ({
      text: `${long} ${i}`,
      article: article(i),
    }));
    const messages = buildDigestMessages([{ category: MARKETS, items }], { date: NOW, mode: 'ai' });

    expect(messages.length).toBeGreaterThan(1);
    for (const m of messages) expect(m.length).toBeLessThanOrEqual(DISCORD_MAX_CHARS);
    expect(messages[1]).toMatch(/^📈 \*\*ตลาดหุ้นและการเงิน\*\* \(ต่อ\)/);
    // ทุกข่าวต้องอยู่ครบ ไม่หายไประหว่างแบ่ง
    for (let i = 0; i < 12; i++) expect(messages.join('\n')).toContain(`${long} ${i}`);
  });

  it('says so when there is no news and when AI was not used', () => {
    const [msg] = buildDigestMessages([], { date: NOW, mode: 'headlines' });
    expect(msg).toContain('ไม่มีข่าวใหม่');
    expect(msg).toContain('แสดงเฉพาะหัวข้อข่าว');
  });
});

describe('createClaudeSummarizer', () => {
  const input: CategoryArticles[] = [
    { category: MARKETS, articles: [article(1), article(2), article(3), article(4)] },
    { category: TECH, articles: [article(5, 'tech')] },
  ];

  function fakeClient(response: object) {
    const parse = vi.fn(async (_params: unknown) => response);
    return { client: { beta: { messages: { parse } } } as never, parse };
  }

  it('maps article ids back to real links, ignoring unknown ids and capping at 3', async () => {
    const { client, parse } = fakeClient({
      stop_reason: 'end_turn',
      parsed_output: {
        sections: [
          {
            category: 'markets',
            items: [
              { article_id: 'a2', summary: 'สรุปสอง' },
              { article_id: 'a99', summary: 'ไม่มีจริง' },
              { article_id: 'a1', summary: 'สรุปหนึ่ง' },
              { article_id: 'a3', summary: 'สรุปสาม' },
              { article_id: 'a4', summary: 'เกินโควตา' },
            ],
          },
          { category: 'tech', items: [{ article_id: 'a5', summary: 'เทค' }] },
        ],
      },
    });

    const sections = await createClaudeSummarizer({ client }).summarize(input);

    expect(sections.map((s) => s.items.map((i) => [i.text, i.article.link]))).toEqual([
      [
        ['สรุปสอง', article(2).link],
        ['สรุปหนึ่ง', article(1).link],
        ['สรุปสาม', article(3).link],
      ],
      [['เทค', article(5, 'tech').link]],
    ]);
    const params = parse.mock.calls[0]![0] as { model: string; fallbacks: string };
    expect(params).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' });
  });

  it('throws on a refusal so the job can fall back to headlines', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal', parsed_output: null });
    await expect(createClaudeSummarizer({ client }).summarize(input)).rejects.toThrow(/declined/);
  });
});

describe('createNewsDigestJob', () => {
  function setup({
    summarizer = null as Summarizer | null,
    send = vi.fn(async (_m: DiscordMessage) => {}),
  } = {}) {
    const repo = new SqliteNewsRepository(':memory:');
    const fetched: Record<string, Article[]> = {
      markets: [article(1), article(2)],
      tech: [article(3, 'tech')],
    };
    const fetcher: FeedFetcher = {
      fetchCategory: async (c) => ({
        articles: fetched[c.id] ?? [],
        errors: c.id === 'tech' ? [{ source: 'Tech', url: 'u', message: 'HTTP 500' }] : [],
      }),
    };
    const notifier: Notifier = { send };
    const job = createNewsDigestJob({
      categories: async () => [MARKETS, TECH],
      fetcher,
      summarizer,
      repo,
      notifier,
      now: () => NOW,
    });
    return { job, repo, send };
  }

  it('sends headlines when there is no summarizer and never repeats them the next day', async () => {
    const { job, send } = setup();

    const first = await job.runOnce();
    expect(first).toMatchObject({
      mode: 'headlines',
      articlesFound: 3,
      messagesSent: 1,
      sendError: null,
    });
    expect(first.feedErrors).toHaveLength(1);
    expect(send.mock.calls[0]![0].content).toContain('Headline 1');

    const second = await job.runOnce();
    expect(second.articlesFound).toBe(0);
    expect(send.mock.calls[1]![0].content).toContain('ไม่มีข่าวใหม่');
  });

  it('falls back to headlines when the summarizer fails', async () => {
    const summarizer: Summarizer = {
      summarize: async () => {
        throw new Error('overloaded');
      },
    };
    const { job } = setup({ summarizer });
    const r = await job.runOnce({ dryRun: true });
    expect(r).toMatchObject({ mode: 'headlines', summarizeError: 'overloaded' });
    expect(r.messages[0]).toContain('Headline 2');
  });

  it('uses AI summaries and fills a category the AI left empty with headlines', async () => {
    const summarizer: Summarizer = {
      summarize: async (input) => [
        { category: MARKETS, items: [{ text: 'สรุปข่าวหนึ่ง', article: input[0]!.articles[0]! }] },
        { category: TECH, items: [] },
      ],
    };
    const { job } = setup({ summarizer });
    const r = await job.runOnce({ dryRun: true });
    expect(r.mode).toBe('ai');
    expect(r.messages[0]).toContain('สรุปข่าวหนึ่ง');
    expect(r.messages[0]).toContain('Headline 3');
  });

  it('does not send or record anything in a dry run', async () => {
    const { job, repo, send } = setup();
    await job.runOnce({ dryRun: true });
    expect(send).not.toHaveBeenCalled();
    expect((await repo.findSent([article(1).key])).size).toBe(0);
  });

  it('does not record articles as sent when Discord fails, so the next run retries', async () => {
    const send = vi.fn(async () => {
      throw new Error('Discord returned HTTP 500');
    });
    const { job, repo } = setup({ send });
    const r = await job.runOnce();
    expect(r.sendError).toBe('Discord returned HTTP 500');
    expect((await repo.findSent([article(1).key])).size).toBe(0);
  });
});

describe('headlinesOnly', () => {
  it('takes at most 3 headlines per category and drops empty categories', () => {
    const sections = headlinesOnly([
      { category: MARKETS, articles: [article(1), article(2), article(3), article(4)] },
      { category: TECH, articles: [] },
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.items.map((i) => i.text)).toEqual([
      'Headline 1',
      'Headline 2',
      'Headline 3',
    ]);
  });
});

describe('SqliteNewsRepository', () => {
  it('remembers sent articles and prunes old history', async () => {
    const repo = new SqliteNewsRepository(':memory:');
    const a = { key: 'k1', title: 't', link: 'l', category: 'markets' };
    await repo.markSent([a], new Date('2026-10-01T00:00:00Z'));
    await repo.markSent([a, { ...a, key: 'k2' }], NOW); // k1 ซ้ำ ไม่ error

    expect(await repo.findSent(['k1', 'k2', 'k3'])).toEqual(new Set(['k1', 'k2']));
    expect(await repo.pruneBefore(new Date('2026-10-15T00:00:00Z'))).toBe(1);
    expect(await repo.findSent(['k1', 'k2'])).toEqual(new Set(['k2']));
    await repo.close();
  });
});

describe('createGeminiSummarizer', () => {
  const input: CategoryArticles[] = [
    { category: MARKETS, articles: [article(1), article(2)] },
    { category: TECH, articles: [article(3, 'tech')] },
  ];

  function fakeGemini(response: object) {
    const generateContent = vi.fn(async (_params: unknown) => response);
    return { client: { models: { generateContent } } as never, generateContent };
  }

  it('asks for JSON in the shared schema and maps ids back to real links', async () => {
    const { client, generateContent } = fakeGemini({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify({
        sections: [
          {
            category: 'markets',
            items: [
              { article_id: 'a2', summary: 'สรุปสอง' },
              { article_id: 'a77', summary: 'ไม่มีจริง' },
            ],
          },
          { category: 'tech', items: [{ article_id: 'a3', summary: 'เทค' }] },
        ],
      }),
    });

    const sections = await createGeminiSummarizer({ apiKey: 'test', client }).summarize(input);

    expect(sections.map((s) => s.items.map((i) => [i.text, i.article.link]))).toEqual([
      [['สรุปสอง', article(2).link]],
      [['เทค', article(3, 'tech').link]],
    ]);
    const params = generateContent.mock.calls[0]![0] as {
      model: string;
      config: { responseMimeType: string; responseJsonSchema: object };
    };
    expect(params.model).toBe('gemini-3.5-flash');
    expect(params.config.responseMimeType).toBe('application/json');
    expect(params.config.responseJsonSchema).toMatchObject({ type: 'object' });
  });

  it('throws on invalid JSON or an early stop so the job can fall back to headlines', async () => {
    const bad = fakeGemini({ candidates: [{ finishReason: 'STOP' }], text: 'not json' });
    await expect(
      createGeminiSummarizer({ apiKey: 'test', client: bad.client }).summarize(input),
    ).rejects.toThrow(/invalid JSON/);

    const blocked = fakeGemini({ candidates: [{ finishReason: 'SAFETY' }], text: '' });
    await expect(
      createGeminiSummarizer({ apiKey: 'test', client: blocked.client }).summarize(input),
    ).rejects.toThrow(/SAFETY/);
  });
});

describe('createGeminiSummarizer fallback model', () => {
  it('tries the lighter model when the main one keeps failing', async () => {
    const ok = {
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify({
        sections: [{ category: 'markets', items: [{ article_id: 'a1', summary: 'ok' }] }],
      }),
    };
    const generateContent = vi.fn(async (params: { model: string }) => {
      if (params.model === 'gemini-3.5-flash') throw new Error('503 high demand');
      return ok;
    });
    const summarizer = createGeminiSummarizer({
      apiKey: 'test',
      client: { models: { generateContent } } as never,
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const sections = await summarizer.summarize([{ category: MARKETS, articles: [article(1)] }]);
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
    ]);
    expect(sections[0]!.items[0]!.text).toBe('ok');
  });
});

describe('createNewsDigestJob daily record', () => {
  function jobWith(send: Notifier['send']) {
    const repo = new SqliteNewsRepository(':memory:');
    const fetcher: FeedFetcher = {
      fetchCategory: async (c) => ({
        articles: c.id === 'markets' ? [article(1)] : [],
        errors: [],
      }),
    };
    const job = createNewsDigestJob({
      categories: async () => [MARKETS],
      fetcher,
      summarizer: null,
      repo,
      notifier: { send },
      now: () => NOW, // 07:00 เวลาไทย วันที่ 29
    });
    return { job, repo };
  }

  it('records the Thai date only after a real send succeeds', async () => {
    const ok = jobWith(async () => {});
    await ok.job.runOnce({ dryRun: true });
    expect(await ok.repo.hasDigestFor('2026-10-29')).toBe(false);
    await ok.job.runOnce();
    expect(await ok.repo.hasDigestFor('2026-10-29')).toBe(true);

    const failing = jobWith(async () => {
      throw new Error('Discord down');
    });
    await failing.job.runOnce();
    expect(await failing.repo.hasDigestFor('2026-10-29')).toBe(false);
  });

  it('joins a run already in progress instead of sending twice', async () => {
    const send = vi.fn(async (_m: DiscordMessage) => {});
    const { job } = jobWith(send);
    const [a, b] = await Promise.all([job.runOnce(), job.runOnce()]);
    expect(a).toBe(b);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
