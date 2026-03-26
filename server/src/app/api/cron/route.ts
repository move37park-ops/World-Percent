import { NextResponse } from 'next/server';
import axios from 'axios';
import { supabase } from '../../../utils/supabase';
import { translateBatchToKorean } from '../../../services/translator';

const POLYMARKET_API_URL = 'https://gamma-api.polymarket.com/events';
const VOLUME_THRESHOLD = 100000;
const TAG_WHITELIST = ['Macro', 'Interest Rates', 'Stocks', 'Equities', 'Geopolitics', 'Elections', 'Politics', 'Crypto', 'Bitcoin', 'Ethereum'];

export async function GET(request: Request) {
    // Vercel Cron Authentication (optional but recommended)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        // 0. CLEANUP: Remove expired markets from DB before fetching new data
        const now = new Date().toISOString();
        const { error: cleanupErr } = await supabase
            .from('markets')
            .delete()
            .lt('end_date', now);
        if (cleanupErr) console.warn('[Cron Worker] Cleanup warning:', cleanupErr.message);
        else console.log('[Cron Worker] Expired markets cleaned up.');

        console.log('[Cron Worker] Starting Polymarket data fetch...');
        const response = await axios.get(POLYMARKET_API_URL, {
            params: { limit: 100, active: true, closed: false, order: 'volume', ascending: false }
        });

        const events = response.data;
        
        // 1. Local Filtering of Target Events
        const targetEvents = events.filter((event: any) => {
            const vol = parseFloat(event.volume || '0');
            if (vol < VOLUME_THRESHOLD) return false;
            
            if (event.endDate) {
                const daysUntilEnd = (new Date(event.endDate).getTime() - Date.now()) / (1000 * 3600 * 24);
                if (daysUntilEnd < 3) return false;
            }

            let hasValidTag = false;
            let isElection = false;

            if (event.tags && Array.isArray(event.tags)) {
                for (const tag of event.tags) {
                    if (!tag.label) continue;
                    const t = tag.label.toLowerCase();
                    if (t === 'elections' || t === 'politics' || t === 'geopolitics') isElection = true;
                    if (TAG_WHITELIST.some(wt => t === wt.toLowerCase())) hasValidTag = true;
                }
            }

            if (!hasValidTag) return false;
            if (isElection && vol < 300000) return false;
            if (!event.markets || event.markets.length === 0) return false;
            
            return true;
        });

        if (targetEvents.length === 0) {
            return NextResponse.json({ success: true, inserted: 0, updated: 0, message: 'No target events found' });
        }

        // 2. BULK FETCH Existing Markets to solve N+1 Query Issue
        const eventIds = targetEvents.map((e: any) => String(e.id));
        const { data: existingMarkets, error } = await supabase
            .from('markets')
            .select('polymarket_id, translated_outcomes')
            .in('polymarket_id', eventIds);

        if (error) throw new Error(`Supabase Bulk Fetch Error: ${error.message}`);

        const existingMap = new Map((existingMarkets || []).map((m: any) => [m.polymarket_id, m]));
        
        const allTextsToTranslate = new Set<string>();
        const processedEvents: any[] = [];
        let newCountForLimits = 0;

        for (const event of targetEvents) {
            // === STEP A: Select Top 10 Sub-Markets by Yes Probability ===
            const parsedMarkets = event.markets.map((m: any) => {
                let obs = m.outcomes;
                if (typeof obs === 'string') { try { obs = JSON.parse(obs); } catch(e){} }
                let prices = m.outcomePrices;
                if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch(e){} }
                
                // "Yes probability" = first price for binary markets
                const yesProb = Array.isArray(prices) ? parseFloat(prices[0] || '0') : 0;
                
                // For multi-choice markets (outcomes > 2), slice outcomes to top 10 by price
                if (Array.isArray(obs) && Array.isArray(prices) && obs.length > 10 && obs.length === prices.length) {
                    const combined = obs.map((o: string, i: number) => ({ o, p: prices[i] }));
                    combined.sort((a: any, b: any) => parseFloat(b.p || '0') - parseFloat(a.p || '0'));
                    const top = combined.slice(0, 10);
                    obs = top.map((x: any) => x.o);
                    prices = top.map((x: any) => x.p);
                }
                
                return {
                    id: m.id,
                    question: m.question || '',
                    outcomes: Array.isArray(obs) ? obs : [],
                    outcomePrices: Array.isArray(prices) ? prices : [],
                    _yesProb: yesProb
                };
            });

            // Filter out resolved or empty submarkets before selecting top 10
            const activeMarkets = parsedMarkets.filter((m: any) => {
                if (!m.outcomePrices || m.outcomePrices.length === 0) return false;
                // A submarket with any price at exactly 0 or 1 (±0.001 tolerance) is considered resolved
                const allPrices = m.outcomePrices.map((p: string) => parseFloat(p));
                const isResolved = allPrices.some((p: number) => p >= 0.999 || p <= 0.001);
                return !isResolved;
            });

            // Sort by Yes probability descending, take top 10 sub-markets
            activeMarkets.sort((a: any, b: any) => b._yesProb - a._yesProb);
            const outcomesList = activeMarkets.slice(0, 10).map(({ _yesProb, ...rest }: any) => rest);

            if (outcomesList.length === 0) continue; // Skip events with no active submarkets

            // === STEP B: Collect texts that need translation ===
            const existing = existingMap.get(String(event.id));

            if (existing) {
                // UPDATE path: only translate outcomes + questions
                outcomesList.forEach((m: any) => {
                    if (m.question) allTextsToTranslate.add(m.question);
                    if (Array.isArray(m.outcomes)) {
                        m.outcomes.forEach((o: string) => { if (o) allTextsToTranslate.add(o); });
                    }
                });
                processedEvents.push({ type: 'update', event, outcomesList });
            } else {
                // INSERT path: translate title + outcomes + questions
                if (newCountForLimits >= 10) {
                    console.log(`[Cron Worker] Vercel Timeout protection: Skipping extra markets.`);
                    continue;
                }
                newCountForLimits++;
                
                if (event.title) allTextsToTranslate.add(event.title);
                outcomesList.forEach((m: any) => {
                    if (m.question) allTextsToTranslate.add(m.question);
                    if (Array.isArray(m.outcomes)) {
                        m.outcomes.forEach((o: string) => { if (o) allTextsToTranslate.add(o); });
                    }
                });
                processedEvents.push({ type: 'insert', event, outcomesList });
            }
        }

        const translateArray = Array.from(allTextsToTranslate);
        let translatedArray: string[] = [];
        try {
            translatedArray = await translateBatchToKorean(translateArray);
        } catch(e) { console.error('Batch translation failed', e); }
        
        const translateMap = new Map<string, string>();
        translateArray.forEach((t, i) => translateMap.set(t, translatedArray[i] || t));

        const getTranslated = (t: string) => translateMap.get(t) || t;

        // Helper: apply translations to an outcomesList
        const translateOutcomesList = (list: any[]) => {
            return list.map((m: any) => ({
                ...m,
                question: m.question ? getTranslated(m.question) : m.question,
                outcomes: Array.isArray(m.outcomes) ? m.outcomes.map((o: string) => getTranslated(o)) : m.outcomes
            }));
        };

        const upsertBatch: any[] = [];
        let newCount = 0;
        let updateCount = 0;

        for (const proc of processedEvents) {
            const { type, event, outcomesList } = proc;
            const translatedOutcomes = translateOutcomesList(outcomesList);
            
            if (type === 'update') {
                upsertBatch.push({
                    polymarket_id: String(event.id),
                    volume: parseFloat(event.volume || '0'),
                    end_date: event.endDate || null,
                    outcomes: outcomesList,
                    translated_outcomes: translatedOutcomes,
                    updated_at: new Date().toISOString()
                });
                updateCount++;
            } else {
                const translatedTitle = getTranslated(event.title);
                
                let category = 'macro';
                if (event.tags && Array.isArray(event.tags)) {
                    for (const tag of event.tags) {
                        if (!tag.label) continue;
                        const rawTag = tag.label.toLowerCase();
                        if (['crypto', 'bitcoin', 'ethereum', 'solana', 'dogecoin'].includes(rawTag)) { category = 'crypto'; break; }
                        else if (['stocks', 'equities', 'business'].includes(rawTag)) { category = 'stock'; break; }
                    }
                }

                upsertBatch.push({
                    polymarket_id: String(event.id),
                    title: translatedTitle,
                    original_title: event.title,
                    translated_title: translatedTitle,
                    category: category,
                    volume: parseFloat(event.volume || '0'),
                    end_date: event.endDate || null,
                    outcomes: outcomesList,
                    translated_outcomes: translatedOutcomes
                });
                newCount++;
            }
        }

        // 3. BULK UPSERT / UPDATE
        if (upsertBatch.length > 0) {
            console.log(`[Cron Worker] Bulk Upserting ${upsertBatch.length} markets...`);
            // Supabase upsert performs a MERGE on the primary key, so existing rows update fields we mapped.
            // Wait, we didn't fetch `title` for existing. Supabase .upsert(data, {ignoreDuplicates: false}) overwrites.
            // If the row is partially provided, the missing fields may become null!
            // To be safe, let's separate insert and update batches to prevent nuking existing titles.
            const inserts = upsertBatch.filter(m => existingMap.has(m.polymarket_id) === false);
            const updates = upsertBatch.filter(m => existingMap.has(m.polymarket_id) === true);

            if (inserts.length > 0) {
                const { error: insErr } = await supabase.from('markets').insert(inserts);
                if (insErr) console.error('Bulk Insert Error:', insErr);
            }

            // Unfortunately Supabase JS doesn't easily bulk update different IDs with different data in one go 
            // without a custom SQL function or multiple RPC calls, BUT we can do it via a bulk Upsert IF we only 
            // upsert full rows. The user code did an individual .update() in the loop.
            // To avoid N+1 entirely, we will iterate `updates` and fire them in parallel using Promise.all(),
            // which handles them efficiently and concurrently for Vercel. Supabase handles 100 concurrent DB updates easily.
            if (updates.length > 0) {
                await Promise.all(updates.map(upd => 
                    supabase.from('markets').update({
                        volume: upd.volume,
                        end_date: upd.end_date,
                        outcomes: upd.outcomes,
                        translated_outcomes: upd.translated_outcomes,
                        updated_at: upd.updated_at
                    }).eq('polymarket_id', upd.polymarket_id)
                ));
            }
        }
        
        return NextResponse.json({ success: true, inserted: newCount, updated: updateCount });
    } catch (error: any) {
        console.error('[Cron Worker] Fatal Error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
