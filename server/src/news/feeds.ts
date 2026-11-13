/**
 * รายชื่อแหล่งข่าว RSS แยกตามหมวด — แก้ไฟล์นี้ได้เลยถ้าอยากเพิ่ม/ลบแหล่งข่าว
 * (ทุก URL ทดสอบแล้วว่าเปิดได้ ณ ต.ค. 2569)
 */

export type NewsCategoryId = 'shariah' | 'islamic' | 'markets' | 'tech';

export interface FeedSource {
  /** ชื่อแหล่งข่าวที่แสดงในข้อความ */
  name: string;
  url: string;
}

export interface NewsCategory {
  id: NewsCategoryId;
  emoji: string;
  title: string;
  feeds: FeedSource[];
}

/** Yahoo Finance รับได้หลาย symbol ต่อฟีด แต่ถ้าใส่เยอะเกินจะได้ข่าวไม่ครบ จึงแบ่งเป็นชุด */
const SYMBOLS_PER_YAHOO_FEED = 10;

/** ฟีดข่าวรายหุ้นจาก Yahoo Finance สำหรับหุ้นในรายชื่อชาริอะห์ของเรา */
export function yahooSymbolFeeds(symbols: string[]): FeedSource[] {
  const feeds: FeedSource[] = [];
  for (let i = 0; i < symbols.length; i += SYMBOLS_PER_YAHOO_FEED) {
    const chunk = symbols.slice(i, i + SYMBOLS_PER_YAHOO_FEED);
    const s = chunk.map(encodeURIComponent).join(',');
    feeds.push({
      name: 'Yahoo Finance',
      url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${s}&region=US&lang=en-US`,
    });
  }
  return feeds;
}

/**
 * หมวดข่าวทั้งหมด เรียงตามลำดับที่จะแสดงในข้อความ
 * @param shariahSymbols symbol จาก server/data/shariah_list.json
 */
export function newsCategories(shariahSymbols: string[]): NewsCategory[] {
  return [
    {
      id: 'shariah',
      emoji: '🕌',
      title: 'หุ้นชาริอะห์ในรายชื่อ',
      feeds: yahooSymbolFeeds(shariahSymbols),
    },
    {
      id: 'islamic',
      emoji: '🌙',
      title: 'การเงินอิสลาม',
      // สองแหล่งนี้โพสต์ไม่บ่อย วันที่ไม่มีบทความใหม่ หมวดนี้จะถูกข้ามไป
      feeds: [
        { name: 'Zoya', url: 'https://blog.zoya.finance/rss/' },
        { name: 'Islamic Finance Guru', url: 'https://www.islamicfinanceguru.com/feed' },
      ],
    },
    {
      id: 'markets',
      emoji: '📈',
      title: 'ตลาดหุ้นและการเงิน',
      feeds: [
        { name: 'CNBC', url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html' },
        { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
        { name: 'ประชาชาติธุรกิจ', url: 'https://www.prachachat.net/finance/feed' },
        { name: 'Bangkok Post', url: 'https://www.bangkokpost.com/rss/data/business.xml' },
      ],
    },
    {
      id: 'tech',
      emoji: '💻',
      title: 'เทคโนโลยี',
      feeds: [
        { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
        { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
      ],
    },
  ];
}
