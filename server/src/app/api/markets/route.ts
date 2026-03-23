import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category')?.toLowerCase() || 'macro';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    try {
        console.log(`[Next.js API] Fetching from Supabase category: ${category}`);
        // Fetch from Supabase directly via REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/markets?category=eq.${category}&select=*`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            },
            cache: 'no-store'
        });
        
        if (!response.ok) {
            throw new Error(`Supabase response not ok: ${response.status}`);
        }
        
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching from Supabase:', error);
        return NextResponse.json({ error: 'Failed to fetch markets from Supabase' }, { status: 500 });
    }
}
