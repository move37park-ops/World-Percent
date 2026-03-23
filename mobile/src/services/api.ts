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

export const fetchMarkets = async (category: string): Promise<Market[]> => {
    try {
        let query = supabase.from('markets').select('*').order('volume', { ascending: false });
        
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

            return {
                id: row.id,
                polymarket_id: row.polymarket_id,
                originalTitle: row.original_title,
                title: row.translated_title,
                volume: parseFloat(row.volume),
                category: row.category,
                markets: parsedTranslatedOutcomes.length > 0 ? parsedTranslatedOutcomes : parsedOutcomes
            };
        });
    } catch (error) {
        console.error('API Error fetching from Supabase:', error);
        return [];
    }
};
