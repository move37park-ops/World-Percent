'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key_to_prevent_crash'
);

interface SubMarket {
    id: string;
    question: string;
    outcomes: string[];
    outcomePrices: string[];
}

interface Market {
    id: string;
    polymarket_id: string;
    title: string;
    originalTitle?: string;
    volume: number;
    category: string;
    markets: SubMarket[];
}

const formatProb = (p: string) => (parseFloat(p) * 100).toFixed(0) + '%';

const LiveOutcome = ({ outcome, initialPrice, marketId }: { outcome: string, initialPrice: string, marketId: string }) => {
    const [price, setPrice] = useState(initialPrice);
    const [flashType, setFlashType] = useState<'up' | 'down' | null>(null);
    const prevRef = useRef(initialPrice);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
        wsRef.current = ws;

        ws.onopen = () => ws.send(JSON.stringify({ assets_ids: [marketId], type: 'market' }));
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (Array.isArray(data)) {
                    data.forEach(update => {
                        if (update.price && update.asset_id === marketId) {
                            const newP = parseFloat(update.price);
                            const oldP = parseFloat(prevRef.current);
                            setFlashType(newP > oldP ? 'up' : 'down');
                            setPrice(update.price);
                            prevRef.current = update.price;
                            setTimeout(() => setFlashType(null), 800);
                        }
                    });
                }
            } catch (e) {}
        };
        return () => ws.close();
    }, [marketId]);

    const color = flashType === 'up' ? '#4ade80' : flashType === 'down' ? '#FFB000' : 'white';

    return (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 8px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ color:'rgba(255,255,255,0.6)', fontSize:'14px', flex:1, paddingRight:'16px' }}>{outcome}</span>
            <span style={{ fontWeight:'bold', fontSize:'18px', color, transition:'color 0.3s', minWidth:'48px', textAlign:'right' }}>{formatProb(price)}</span>
        </div>
    );
};

export default function Home() {
    const [markets, setMarkets] = useState<Market[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

    const loadMarkets = async (category: string) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('markets')
            .select('*')
            .eq('category', category)
            .gt('end_date', new Date().toISOString())  // Only active markets
            .order('volume', { ascending: false });

        if (error) { console.error(error); setLoading(false); return; }

        const parsed = (data || []).map((row: any) => {
            let markets: SubMarket[] = [];
            try { markets = typeof row.translated_outcomes === 'string' ? JSON.parse(row.translated_outcomes) : row.translated_outcomes || []; } catch(e){}
            return {
                id: row.id,
                polymarket_id: row.polymarket_id,
                title: row.translated_title || row.title,
                originalTitle: row.original_title,
                volume: parseFloat(row.volume),
                category: row.category,
                markets
            };
        });

        setMarkets(parsed);
        setLoading(false);
    };

    const s: Record<string, React.CSSProperties> = {
        page: { minHeight:'100vh', background:'#000', color:'white', fontFamily:'"Geist", sans-serif', padding:'48px 24px', maxWidth:'1200px', margin:'0 auto' },
        h1: { fontSize:'clamp(32px, 5vw, 56px)', fontWeight:'bold', letterSpacing:'-2px', marginBottom:'8px' },
        sub: { color:'rgba(255,255,255,0.3)', fontSize:'11px', letterSpacing:'3px', marginBottom:'60px' },
        catGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'20px', marginTop:'40px' },
        catCard: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', padding:'36px 28px', cursor:'pointer', transition:'border-color 0.2s' },
        card: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', padding:'28px', cursor:'pointer', transition:'border-color 0.2s, background 0.2s' },
        back: { display:'inline-block', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', padding:'8px 20px', marginBottom:'32px', cursor:'pointer', fontSize:'12px', letterSpacing:'2px' } as React.CSSProperties,
        glass: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.1)', padding:'32px' },
    };

    if (!selectedCategory) {
        return (
            <main style={s.page}>
                <h1 style={s.h1}>WORLD %</h1>
                <p style={s.sub}>BEYOND PROBABILITY • REALTIME INSIGHTS</p>
                <div style={s.catGrid}>
                    {([['macro','거시경제 / MACRO'],['stock','주식 / STOCK'],['crypto','가상자산 / CRYPTO']] as [string,string][]).map(([cat, label]) => (
                        <div key={cat} style={s.catCard} onClick={() => { setSelectedCategory(cat); loadMarkets(cat); }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <span style={{ fontSize:'18px', fontWeight:'bold', letterSpacing:'0.5px' }}>{label}</span>
                                <span style={{ opacity:0.4 }}>→</span>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        );
    }

    if (selectedMarket) {
        return (
            <main style={s.page}>
                <button style={s.back} onClick={() => setSelectedMarket(null)}>← BACK TO LIST</button>
                <div style={s.glass}>
                    <h2 style={{ fontSize:'28px', fontWeight:'bold', marginBottom:'8px', lineHeight:1.3 }}>{selectedMarket.title}</h2>
                    {selectedMarket.originalTitle && (
                        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'15px', marginBottom:'24px', lineHeight:1.4 }}>{selectedMarket.originalTitle}</p>
                    )}
                    <p style={{ color:'rgba(255,255,255,0.3)', fontSize:'12px', marginBottom:'32px', letterSpacing:'1px' }}>VOL: ${selectedMarket.volume.toLocaleString()}</p>
                    {selectedMarket.markets.map((sub) => {
                        const prices = Array.isArray(sub.outcomePrices) ? sub.outcomePrices : [];
                        const outcomes = Array.isArray(sub.outcomes) ? sub.outcomes : [];
                        const isBinary = outcomes.length === 2 && ['yes','예'].includes((outcomes[0]||'').toLowerCase());

                        if (isBinary) {
                            return <LiveOutcome key={sub.id} outcome={sub.question || sub.id} initialPrice={prices[0] || '0'} marketId={sub.id} />;
                        }
                        return outcomes.map((o, i) => (
                            <LiveOutcome key={`${sub.id}-${i}`} outcome={o} initialPrice={prices[i] || '0'} marketId={sub.id} />
                        ));
                    })}
                </div>
            </main>
        );
    }

    return (
        <main style={s.page}>
            <button style={s.back} onClick={() => { setSelectedCategory(null); setMarkets([]); }}>← CATEGORIES</button>
            <h2 style={{ fontSize:'28px', fontWeight:'bold', marginBottom:'28px' }}>
                {selectedCategory === 'macro' ? '거시경제 / MACRO' : selectedCategory === 'stock' ? '주식 / STOCK' : '가상자산 / CRYPTO'}
            </h2>
            {loading ? (
                <p style={{ color:'rgba(255,255,255,0.3)', letterSpacing:'2px' }}>LOADING...</p>
            ) : markets.length === 0 ? (
                <p style={{ color:'rgba(255,255,255,0.2)', letterSpacing:'2px' }}>NO MARKETS</p>
            ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:'16px' }}>
                    {markets.map(m => (
                        <div key={m.id} style={s.card} onClick={() => setSelectedMarket(m)}>
                            <p style={{ color:'rgba(255,255,255,0.3)', fontSize:'10px', letterSpacing:'2px', marginBottom:'12px' }}>{m.category?.toUpperCase()}</p>
                            <p style={{ fontWeight:'bold', fontSize:'17px', lineHeight:1.4, marginBottom:'8px' }}>{m.title}</p>
                            {m.originalTitle && (
                                <p style={{ color:'rgba(255,255,255,0.4)', fontSize:'13px', lineHeight:1.4, marginBottom:'20px' }}>{m.originalTitle}</p>
                            )}
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'rgba(255,255,255,0.25)', letterSpacing:'1px' }}>
                                <span>VOL: ${m.volume.toLocaleString()}</span>
                                <span>DETAILS →</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}
