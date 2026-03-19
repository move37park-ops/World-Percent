import express from 'express';
import { getDB } from '../config/db';

export const marketRouter = express.Router();

marketRouter.get('/', async (req, res) => {
    try {
        const db = await getDB();
        const category = req.query.category;
        
        let rows;
        if (category) {
            rows = await db.all('SELECT * FROM markets WHERE category = ? ORDER BY volume DESC', [category]);
        } else {
            rows = await db.all('SELECT * FROM markets ORDER BY volume DESC');
        }
        
        // Parse the JSON string outcomes back into objects for the frontend
        const formattedMarkets = rows.map((row: any) => {
            let parsedOutcomes = [];
            let parsedTranslatedOutcomes = [];
            
            try { if (row.outcomes) parsedOutcomes = JSON.parse(row.outcomes); } catch(e){}
            try { if (row.translated_outcomes) parsedTranslatedOutcomes = JSON.parse(row.translated_outcomes); } catch(e){}

            return {
                id: row.polymarket_id,
                originalTitle: row.original_title,
                title: row.translated_title,
                volume: row.volume,
                endDate: row.end_date,
                category: row.category,
                markets: parsedTranslatedOutcomes.length > 0 ? parsedTranslatedOutcomes : parsedOutcomes
            };
        });

        res.json(formattedMarkets);
    } catch (error) {
        console.error('Error in market route:', error);
        res.status(500).json({ error: 'Failed to fetch markets' });
    }
});
