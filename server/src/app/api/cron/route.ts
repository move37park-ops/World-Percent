import { NextResponse } from 'next/server';
import axios from 'axios';
import { supabase } from '../../../utils/supabase';
import { translateToKorean, translateBatchToKorean } from '../../../services/translator';

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
        
        const upsertBatch: any[] = [];
        let newCount = 0;
        let updateCount = 0;

        for (const event of targetEvents) {
            const outcomesList = event.markets.map((m: any) => ({
                id: m.id,
                question: m.question,
                outcomes: m.outcomes, 
                outcomePrices: m.outcomePrices 
            }));

            const existing = existingMap.get(String(event.id));

            if (existing) {
                // Formatting for Update
                let updatedTranslatedOutcomes = existing.translated_outcomes;
                try {
                    const parsedTranslated = typeof existing.translated_outcomes === 'string' 
                        ? JSON.parse(existing.translated_outcomes) 
                        : existing.translated_outcomes;
                    
                    const newTranslated = outcomesList.map((newMarket: any) => {
                        const oldMarket = (Array.isArray(parsedTranslated) ? parsedTranslated : []).find((pt: any) => pt.id === newMarket.id);
                        if (oldMarket) {
                            let oldObs = oldMarket.outcomes;
                            let newObs = newMarket.outcomes;
                            if (typeof oldObs === 'string') try { oldObs = JSON.parse(oldObs); } catch(e){}
                            if (typeof newObs === 'string') try { newObs = JSON.parse(newObs); } catch(e){}
                            
                            // Keep old translation only if length perfectly matches
                            if (Array.isArray(oldObs) && Array.isArray(newObs) && oldObs.length === newObs.length) {
                                return { ...newMarket, question: oldMarket.question, outcomes: oldObs, outcomePrices: newMarket.outcomePrices };
                            }
                        }
                        return { ...newMarket, _needsTranslation: true };
                    });

                    for (let i = 0; i < newTranslated.length; i++) {
                        if (newTranslated[i]._needsTranslation) {
                            console.log(`[Cron Worker] Dynamic Outcome detected. Translating new sub-market: ${newTranslated[i].question}`);
                            const tQuestion = await translateToKorean(newTranslated[i].question);
                            let obs = newTranslated[i].outcomes;
                            if (typeof obs === 'string') try { obs = JSON.parse(obs); } catch(e){}
                            if (Array.isArray(obs)) {
                                const seq = [];
                                for (const o of obs) {
                                    const lowerO = (o || '').toLowerCase();
                                    if (!o) seq.push('');
                                    else if (lowerO === 'yes') seq.push('예');
                                    else if (lowerO === 'no') seq.push('아니오');
                                    else seq.push(await translateToKorean(o));
                                }
                                obs = seq;
                            }
                            newTranslated[i].question = tQuestion;
                            newTranslated[i].outcomes = obs;
                            delete newTranslated[i]._needsTranslation;
                        }
                    }

                    updatedTranslatedOutcomes = newTranslated;
                } catch (e) { console.error('Error updating prices:', e); }

                upsertBatch.push({
                    polymarket_id: String(event.id),
                    // Missing required titles will be ignored by pure update, but doing a full upsert 
                    // requires all required fields. Supabase .upsert() replaces whole row if we don't supply everything unless we do .update().
                    // Since it's N+1, we'll do an upsert but we need the titles. Wait, we don't have titles in select!
                    // Let's just collect updates and inserts separately, or fetch everything required.
                    volume: parseFloat(event.volume || '0'),
                    end_date: event.endDate || null,
                    outcomes: outcomesList,
                    translated_outcomes: updatedTranslatedOutcomes,
                    updated_at: new Date().toISOString()
                });
                updateCount++;
            } else {
                // Translation Limiter
                if (newCount >= 10) {
                    console.log(`[Cron Worker] Vercel Timeout protection: Skipping extra markets.`);
                    continue; 
                }

                console.log(`[Cron Worker] Translating Market: ${event.title}`);
                
                const textsToTranslate: string[] = [];
                const pointerMap: { type: 'title' | 'question' | 'outcome', original: string, mappedIndex: number, staticFallback?: string, refIndex?: number }[] = [];
                
                pointerMap.push({ type: 'title', original: event.title, mappedIndex: textsToTranslate.length });
                textsToTranslate.push(event.title);
                
                outcomesList.forEach((m: any, mIdx: number) => {
                    if (m.question) {
                        pointerMap.push({ type: 'question', original: m.question, mappedIndex: textsToTranslate.length, refIndex: mIdx });
                        textsToTranslate.push(m.question);
                    }
                    
                    let obs = m.outcomes;
                    if (typeof obs === 'string') { try { obs = JSON.parse(obs); } catch(e){} }
                    if (Array.isArray(obs)) {
                        obs.forEach((o, oIdx) => {
                            const lowerO = (o || '').toLowerCase();
                            if (!o) {
                                pointerMap.push({ type: 'outcome', original: o, mappedIndex: -1, staticFallback: '', refIndex: mIdx });
                            } else if (lowerO === 'yes') {
                                pointerMap.push({ type: 'outcome', original: o, mappedIndex: -1, staticFallback: '예', refIndex: mIdx });
                            } else if (lowerO === 'no') {
                                pointerMap.push({ type: 'outcome', original: o, mappedIndex: -1, staticFallback: '아니오', refIndex: mIdx });
                            } else {
                                pointerMap.push({ type: 'outcome', original: o, mappedIndex: textsToTranslate.length, refIndex: mIdx });
                                textsToTranslate.push(o);
                            }
                        });
                    }
                });

                let translatedTexts: string[];
                try {
                    translatedTexts = await translateBatchToKorean(textsToTranslate);
                } catch (e) {
                    console.error(`[Cron Worker] Skipping market ${event.id} due to translation failure:`, e);
                    continue; // Skip inserting this market to prevent poisoning the DB with english text
                }
                
                let translatedTitle = event.title;
                const finalOutcomesList = JSON.parse(JSON.stringify(outcomesList)); // deep clone
                const outcomeCounters: { [key: number]: number } = {};

                pointerMap.forEach(ptr => {
                    const tStr = ptr.mappedIndex >= 0 ? translatedTexts[ptr.mappedIndex] : ptr.staticFallback;
                    if (ptr.type === 'title') { translatedTitle = tStr || event.title; }
                    else if (ptr.type === 'question' && ptr.refIndex !== undefined) { finalOutcomesList[ptr.refIndex].question = tStr || ptr.original; }
                    else if (ptr.type === 'outcome' && ptr.refIndex !== undefined) {
                        if (outcomeCounters[ptr.refIndex] === undefined) outcomeCounters[ptr.refIndex] = 0;
                        const idx = outcomeCounters[ptr.refIndex]++;
                        let currentOutcomes = finalOutcomesList[ptr.refIndex].outcomes;
                        if (typeof currentOutcomes === 'string') { try { currentOutcomes = JSON.parse(currentOutcomes); } catch(e){} }
                        if (Array.isArray(currentOutcomes)) {
                            currentOutcomes[idx] = tStr || ptr.original;
                            finalOutcomesList[ptr.refIndex].outcomes = currentOutcomes;
                        }
                    }
                });
                
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
                    outcomes: finalOutcomesList,
                    translated_outcomes: finalOutcomesList
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
