import { NextResponse } from 'next/server';
import { fetchTopMarkets, Market } from '../../../lib/polymarket';
import { translateToKorean } from '../../../lib/translator';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
    macro: [
        "Fed rate cuts",
        "AI bubble burst by",
        "Fed decision in March?",
        "Will Trump acquire Greenland",
        "Russia x Ukraine ceasefire",
        "Will China invade Taiwan",
        "Bitcoin vs. Gold vs. S&P 500"
    ],
    stock: [
        "Largest Company end of March",
        "Largest Company end of June",
        "Largest Company end of December"
    ],
    crypto: [
        "What price will Bitcoin hit in February",
        "What price will Ethereum hit in February",
        "What price will Solana hit in February",
        "What price will Bitcoin hit in 2026",
        "What price will Ethereum hit in 2026"
    ]
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category')?.toLowerCase();

    console.log(`[API] Received request for category: ${category}`);

    try {
        const rawMarkets = await fetchTopMarkets();

        let filteredMarkets = rawMarkets;

        if (category && CATEGORY_KEYWORDS[category]) {
            const keywords = CATEGORY_KEYWORDS[category];
            filteredMarkets = rawMarkets.filter(market =>
                keywords.some(keyword =>
                    market.title.toLowerCase().includes(keyword.toLowerCase())
                )
            );
        }

        // Translate titles (Translation currently original English as per request)
        const translatedMarkets = await Promise.all(
            filteredMarkets.map(async (market) => {
                const translatedTitle = await translateToKorean(market.title);
                return {
                    ...market,
                    title: translatedTitle,
                    originalTitle: market.title,
                };
            })
        );

        return NextResponse.json(translatedMarkets);
    } catch (error) {
        console.error('Error in market API route:', error);
        return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 });
    }
}
