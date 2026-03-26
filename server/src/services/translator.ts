import { supabase } from '../utils/supabase';

const DEEPL_API_KEY = process.env.DEEPL_API_KEY || '';

export const translateBatchToKorean = async (texts: string[]): Promise<string[]> => {
    if (!texts || texts.length === 0) return texts;
    
    // Dedup input array to save DB lookups
    const uniqueTexts = Array.from(new Set(texts)).filter(t => t.trim() !== '');
    if (uniqueTexts.length === 0) return texts;

    // 1. Check cache
    const { data: cached, error: cacheErr } = await supabase
        .from('translation_cache')
        .select('source_text, translated_text')
        .in('source_text', uniqueTexts);

    if (cacheErr) console.error('Cache Read Error:', cacheErr);

    const cacheMap = new Map<string, string>();
    (cached || []).forEach(row => cacheMap.set(row.source_text, row.translated_text));

    const textsToTranslate = uniqueTexts.filter(t => {
        const lower = t.toLowerCase();
        return !cacheMap.has(t) && lower !== 'yes' && lower !== 'no';
    });
    
    // 2. Call DeepL for the missing texts in chunks of 50
    if (textsToTranslate.length > 0 && DEEPL_API_KEY) {
        try {
            const isFree = DEEPL_API_KEY.endsWith(':fx');
            const url = isFree ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
            
            const CHUNK_SIZE = 50;
            for (let i = 0; i < textsToTranslate.length; i += CHUNK_SIZE) {
                const chunk = textsToTranslate.slice(i, i + CHUNK_SIZE);
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: chunk,
                        target_lang: 'KO',
                        formality: 'prefer_more'
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.error(`DeepL API error for chunk: ${response.status} ${errText}`);
                    continue; // Skip this chunk but try others
                }

                const data = await response.json();
                const translations = data.translations.map((t: any) => t.text);
                
                const newCacheEntries = chunk.map((text, idx) => ({
                    source_text: text,
                    translated_text: translations[idx]
                }));

                newCacheEntries.forEach(entry => cacheMap.set(entry.source_text, entry.translated_text));

                // Insert new translations into Supabase cache
                const { error: insErr } = await supabase
                    .from('translation_cache')
                    .upsert(newCacheEntries, { onConflict: 'source_text' });
                    
                if (insErr) console.error('Cache Write Error:', insErr);
            }
        } catch (error) {
            console.error('Batch Translation error:', error);
            // If the translation fails entirely, we log it and gracefully return what we have
        }
    }

    // 3. Rebuild the final array matching original indexes and apply custom hardcoded overrides
    return texts.map(t => {
        if (!t || !t.trim()) return t;
        const lowerT = t.toLowerCase();
        if (lowerT === 'yes') return '예';
        if (lowerT === 'no') return '아니오';
        return cacheMap.get(t) || t;
    });
};

export const translateToKorean = async (text: string): Promise<string> => {
    const res = await translateBatchToKorean([text]);
    return res[0] || text;
};
