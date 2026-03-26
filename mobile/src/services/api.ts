import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Market {
    id: string; // the database UUID
    polymarket_id: string;
    title: string;
    originalTitle?: string;
    volume: number;
    category?: string;
    markets: {
        id: string;
        question: string;
        outcomes: string; 
        outcomePrices: string; 
    }[];
}

/** Returns true if a submarket appears to have already resolved (price stuck at 0% or 100%) */
const isResolvedSubmarket = (sub: any): boolean => {
    let prices: string[] = [];
    try {
        prices = Array.isArray(sub.outcomePrices)
            ? sub.outcomePrices
            : JSON.parse(sub.outcomePrices || '[]');
    } catch(e) {}
    if (prices.length === 0) return true; // no price data → skip
    return prices.some(p => {
        const n = parseFloat(p);
        return n >= 0.999 || n <= 0.001;
    });
};

export const fetchMarkets = async (category: string): Promise<Market[]> => {
    try {
        let query = supabase
            .from('markets')
            .select('*')
            .gt('end_date', new Date().toISOString())  // Only active markets
            .order('volume', { ascending: false });
        
        if (category) {
            query = query.eq('category', category);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data.map((row: any) => {
            let parsedOutcomes = [];
            let parsedTranslatedOutcomes = [];
            
            try { if (row.outcomes) parsedOutcomes = typeof row.outcomes === 'string' ? JSON.parse(row.outcomes) : row.outcomes; } catch(e){}
            try { if (row.translated_outcomes) parsedTranslatedOutcomes = typeof row.translated_outcomes === 'string' ? JSON.parse(row.translated_outcomes) : row.translated_outcomes; } catch(e){}

            const allMarkets = parsedTranslatedOutcomes.length > 0 ? parsedTranslatedOutcomes : parsedOutcomes;
            // Filter out already-resolved submarkets at display time
            const activeMarkets = allMarkets.filter((sub: any) => !isResolvedSubmarket(sub));

            return {
                id: row.id,
                polymarket_id: row.polymarket_id,
                originalTitle: row.original_title,
                title: row.translated_title,
                volume: parseFloat(row.volume),
                category: row.category,
                markets: activeMarkets
            };
        }).filter((m: Market) => m.markets.length > 0); // skip events with zero active subs
    } catch (error) {
        console.error('API Error fetching from Supabase:', error);
        return [];
    }
};
