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

export const fetchTopMarkets = async (category?: string): Promise<Market[]> => {
    try {
        // We will fetch more to ensure we can filter for the user's specific questions if needed
        // or just fetch by search query if the API supports it.
        // For now, let's keep the general fetch but we will implement specific filtering in the route.
        const response = await axios.get(POLYMARKET_API_URL, {
            params: {
                limit: 100,
                active: true,
                closed: false,
                order: 'volume',
                ascending: false
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching Polymarket data:', error);
        return [];
    }
};
