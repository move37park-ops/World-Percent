import axios from 'axios';

const POLYMARKET_API_URL = 'https://gamma-api.polymarket.com/events';

export interface Market {
    id: string;
    title: string;
    ticker?: string;
    volume?: number;
    markets: {
        id: string;
        question: string;
        outcomes: string;
        outcomePrices: string;
    }[];
}

import { MARKET_CONFIG } from '../config/marketConfig';

export const fetchTopMarkets = async (limit: number = 20): Promise<Market[]> => {
    try {
        const response = await axios.get(POLYMARKET_API_URL, {
            params: {
                limit: limit,
                active: true,
                closed: false,
                order: 'volume', // Sort by volume to get popular ones
                ascending: false
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching Polymarket data:', error);
        return [];
    }
};

export const fetchMarketsByCategory = async (category: string): Promise<Market[]> => {
    // 1. Fetch a broad set of active markets
    const allMarkets = await fetchTopMarkets(1000);

    // 2. Get target config for the category
    const targetConfig = (MARKET_CONFIG as any)[category] || [];

    if (targetConfig.length === 0) {
        return [];
    }

    // Extract just the string IDs for filtering
    const targetIdList = targetConfig.map((item: any) => item.id.toString());

    // Filter markets that match our specific IDs
    const filteredMarkets = allMarkets.filter(market => targetIdList.includes(market.id.toString()));

    // 3. Map to ordered list and attach custom titles from config
    const orderedMarkets = targetConfig.map((configItem: any) => {
        const market = filteredMarkets.find(m => m.id.toString() === configItem.id.toString());
        if (market) {
            return {
                ...market,
                title: configItem.title, // Use custom Korean title from config
                originalTitle: market.title // Keep original for reference
            } as Market;
        }
        return undefined;
    }).filter((m: any): m is Market => m !== undefined);

    return orderedMarkets;
};
