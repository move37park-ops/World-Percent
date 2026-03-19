import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category')?.toLowerCase() || 'macro';

    console.log(`[Next.js API] Proxying request for category: ${category} to local backend`);

    try {
        // Fetch from the refactored automated backend
        const response = await fetch(`http://localhost:3000/api/markets?category=${category}`, {
            cache: 'no-store'
        });
        
        if (!response.ok) {
            throw new Error(`Backend response was not ok: ${response.status}`);
        }
        
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error in market API proxy:', error);
        return NextResponse.json({ error: 'Failed to fetch markets from backend' }, { status: 500 });
    }
}
