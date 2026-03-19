import cron from 'node-cron';
import axios from 'axios';
import { getDB } from '../config/db';
import { translateToKorean } from './translator';

const POLYMARKET_API_URL = 'https://gamma-api.polymarket.com/events';
const VOLUME_THRESHOLD = 100000;
const TAG_WHITELIST = ['Macro', 'Interest Rates', 'Stocks', 'Equities', 'Geopolitics', 'Elections', 'Politics', 'Crypto', 'Bitcoin', 'Ethereum'];

export const startWorker = () => {
    // Run every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
        console.log('[Worker] Starting Polymarket data fetch...');
        await fetchAndProcessMarkets();
    });

    // Run once immediately on startup
    fetchAndProcessMarkets();
};

const fetchAndProcessMarkets = async () => {
    try {
        const db = await getDB();
        
        // Fetch top 300 markets by volume
        const response = await axios.get(POLYMARKET_API_URL, {
            params: {
                limit: 300,
                active: true,
                closed: false,
                order: 'volume',
                ascending: false
            }
        });

        const events = response.data;
        console.log(`[Worker] Fetched ${events.length} active events from Polymarket.`);

        let newCount = 0;

        for (const event of events) {
            const vol = parseFloat(event.volume || '0');
            
            // Filter 1: Volume > $100,000
            if (vol < VOLUME_THRESHOLD) continue;

            // Filter 2: End date > 3 days
            if (event.endDate) {
                const endDate = new Date(event.endDate);
                const daysUntilEnd = (endDate.getTime() - Date.now()) / (1000 * 3600 * 24);
                if (daysUntilEnd < 3) continue;
            }

            // Filter 3: Tag Whitelist & Election Special Rule
            let hasValidTag = false;
            let isElection = false;

            if (event.tags && Array.isArray(event.tags)) {
                hasValidTag = event.tags.some((tag: any) => {
                    if (!tag.label) return false;
                    const t = tag.label.toLowerCase();
                    if (t === 'elections' || t === 'politics' || t === 'geopolitics') {
                        isElection = true;
                    }
                    return TAG_WHITELIST.some(whitelistTag => t === whitelistTag.toLowerCase());
                });
            }
            
            // Fallback to title matching
            if (!hasValidTag) {
                const titleLower = (event.title || '').toLowerCase();
                hasValidTag = TAG_WHITELIST.some(wt => {
                    const isMatch = titleLower.includes(wt.toLowerCase());
                    if (isMatch && (wt.toLowerCase() === 'elections' || wt.toLowerCase() === 'politics')) {
                        isElection = true;
                    }
                    return isMatch;
                });
            }

            if (!hasValidTag) continue;

            // Special Rule: Korean users don't care about minor overseas elections.
            if (isElection && vol < 300000) {
                // console.log(`[Worker] Skipped minor election: ${event.title} ($${vol})`);
                continue;
            }

            if (!event.markets || event.markets.length === 0) continue;
            
            console.log(`[Worker] Processing matched event: ${event.title} (Vol: $${vol})`);

            const outcomesList = event.markets.map((m: any) => ({
                id: m.id,
                question: m.question,
                outcomes: m.outcomes, 
                outcomePrices: m.outcomePrices 
            }));

            const outcomesJson = JSON.stringify(outcomesList);

            const existing = await db.get('SELECT * FROM markets WHERE polymarket_id = ?', [String(event.id)]);

            if (existing) {
                await db.run(
                    'UPDATE markets SET volume = ?, end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE polymarket_id = ?',
                    [vol, event.endDate || null, String(event.id)]
                );
            } else {
                console.log(`[Worker] Translating: ${event.title}`);
                const translatedTitle = await translateToKorean(event.title);
                
                const translatedOutcomesList = [];
                for (const m of outcomesList) {
                    const tQuestion = await translateToKorean(m.question);
                    let tOutcomes = m.outcomes;
                    if (typeof m.outcomes === 'string') {
                        try { tOutcomes = JSON.parse(m.outcomes); } catch(e){}
                    }
                    if (Array.isArray(tOutcomes)) {
                        tOutcomes = await Promise.all(tOutcomes.map(async (o: string) => {
                            if (!o) return '';
                            if (o.toLowerCase() === 'yes') return '예';
                            if (o.toLowerCase() === 'no') return '아니오';
                            return await translateToKorean(o);
                        }));
                    }
                    translatedOutcomesList.push({
                        ...m,
                        question: tQuestion,
                        outcomes: tOutcomes
                    });
                }
                const translatedOutcomesJson = JSON.stringify(translatedOutcomesList);

                let category = 'macro'; // Default
                if (event.tags && event.tags.length > 0) {
                    const rawTag = event.tags[0].label.toLowerCase();
                    if (['crypto', 'bitcoin', 'ethereum', 'solana', 'dogecoin'].includes(rawTag)) {
                        category = 'crypto';
                    } else if (['stocks', 'equities', 'business'].includes(rawTag)) {
                        category = 'stock';
                    }
                }

                await db.run(
                    `INSERT INTO markets (
                        id, polymarket_id, title, original_title, translated_title, outcomes, translated_outcomes, category, volume, end_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        String(event.id), 
                        String(event.id),
                        translatedTitle, 
                        event.title,
                        translatedTitle,
                        outcomesJson,
                        translatedOutcomesJson,
                        category,
                        vol,
                        event.endDate || null
                    ]
                );
                newCount++;
            }
        }
        console.log(`[Worker] Finished processing. Inserted ${newCount} new markets.`);
    } catch (error) {
        console.error('[Worker] Error fetching or processing markets:', error);
    }
};
