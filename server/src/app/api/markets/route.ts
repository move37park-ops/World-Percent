import { NextResponse } from 'next/server';
import { fetchMarketsByCategory, Market } from '../../../lib/polymarket';
import { translateToKorean } from '../../../lib/translator';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category')?.toLowerCase() || 'macro';

    console.log(`[API] Received request for category: ${category}`);

    try {
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

        return NextResponse.json(translatedMarkets);
    } catch (error) {
        console.error('Error in market API route:', error);
        return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 });
    }
}
