import express from 'express';
import { fetchTopMarkets, fetchMarketsByCategory, Market } from '../services/polymarket';
import { translateToKorean } from '../services/translator';

export const marketRouter = express.Router();

marketRouter.get('/', async (req, res) => {
    try {
        const category = (req.query.category as string) || 'macro'; // Default to macro
        console.log(`Fetching markets for category: ${category}`);

        const rawMarkets = await fetchMarketsByCategory(category);

        // Translate titles in parallel
        const translatedMarkets = await Promise.all(
            rawMarkets.map(async (market) => {
                // If we already have a custom title (indicated by presence of originalTitle), skip translation
                let translatedTitle = market.title;

                if (!(market as any).originalTitle) {
                    translatedTitle = await translateToKorean(market.title);
                }

                return {
                    ...market,
                    title: translatedTitle,
                    originalTitle: (market as any).originalTitle || market.title,
                };
            })
        );

        res.json(translatedMarkets);
    } catch (error) {
        console.error('Error in market route:', error);
        res.status(500).json({ error: 'Failed to fetch markets' });
    }
});
