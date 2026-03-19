'use client';

import React, { useEffect, useState, useRef } from 'react';

interface Market {
    id: string;
    title: string;
    originalTitle?: string;
    volume: number;
    category: string;
    markets: {
        id: string;
        question: string;
        outcomes: string[];
    }[];
}

const formatProb = (p: string) => (parseFloat(p) * 100).toFixed(0) + '%';

const LiveOutcome = ({ outcome, initialPrice, marketId }: { outcome: string, initialPrice: string, marketId: string }) => {
    const [price, setPrice] = useState(initialPrice);
    const [isFlashing, setIsFlashing] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({ assets_ids: [marketId], type: "market" }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (Array.isArray(data)) {
                    data.forEach(update => {
                        if (update.price && update.asset_id === marketId) {
                            setPrice(update.price);
                            setIsFlashing(true);
                            setTimeout(() => setIsFlashing(false), 1000);
                        }
                    });
                }
            } catch (e) {}
        };

        return () => ws.close();
    }, [marketId]);

    return (
        <div className="flex justify-between py-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors px-2">
            <span className="text-white/60 text-sm md:text-base">{outcome}</span>
            <span className={`font-bold text-base md:text-lg ${isFlashing ? 'flash-active' : ''}`}>
                {formatProb(price)}
            </span>
        </div>
    );
};

export default function Home() {
    const [markets, setMarkets] = useState<Market[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

    useEffect(() => {
        fetch('/api/markets')
            .then(res => res.json())
            .then(data => {
                setMarkets(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="text-white text-xl animate-pulse font-mono tracking-widest">LOADING WORLD TERMINAL...</div>
            </div>
        );
    }

    return (
        <main className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto relative">
            <div className="grid-bg"></div>
            
            <header className="mb-16">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-2">WORLD TERMINAL</h1>
                <p className="text-white/40 text-xs md:text-sm tracking-[0.3em] font-medium">BEYOND PROBABILITY • REALTIME INSIGHTS</p>
            </header>

            {selectedMarket ? (
                <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <button 
                        onClick={() => setSelectedMarket(null)}
                        className="glass px-6 py-2 mb-8 hover:bg-white/10 transition-all text-xs font-bold tracking-widest uppercase"
                    >
                        ← Back to List
                    </button>

                    <div className="glass p-8 md:p-12">
                        <div className="mb-12">
                            <h2 className="text-2xl md:text-4xl font-bold leading-tight mb-4">{selectedMarket.title}</h2>
                            <p className="text-white/40 text-sm font-mono uppercase">VOLUME: ${selectedMarket.volume.toLocaleString()}</p>
                        </div>

                        <div className="space-y-2">
                            {selectedMarket.markets[0].outcomes.map((outcome, idx) => (
                                <LiveOutcome 
                                    key={idx} 
                                    outcome={outcome} 
                                    initialPrice="0.5" // Placeholder as initial from DB
                                    marketId={selectedMarket.id}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-700">
                    {markets.map((market) => (
                        <div 
                            key={market.id}
                            onClick={() => setSelectedMarket(market)}
                            className="glass p-8 glow-hover transition-all cursor-pointer group"
                        >
                            <div className="mb-8">
                                <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-4 block">{market.category || 'GENERAL'}</span>
                                <h3 className="text-xl font-bold group-hover:text-white transition-colors line-clamp-2 min-h-[3.5rem]">{market.title}</h3>
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-mono text-white/30">
                                <span>VOL: ${market.volume.toLocaleString()}</span>
                                <span className="group-hover:translate-x-1 transition-transform">DETAILS →</span>
                            </div>
                        </div>
                    ))}
                    {markets.length === 0 && (
                        <div className="col-span-full py-20 text-center glass text-white/20">NO ACTIVE MARKETS DETECTED</div>
                    )}
                </div>
            )}

            <style jsx global>{`
                .glass {
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 0;
                }
                .glow-hover:hover {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: rgba(255, 255, 255, 0.3);
                }
                .flash-active {
                    animation: flash-green 1s cubic-bezier(0.22, 1, 0.36, 1);
                }
                @keyframes flash-green {
                    0% { color: #4ade80; text-shadow: 0 0 10px #4ade80; }
                    100% { color: white; text-shadow: none; }
                }
                .grid-bg {
                    background-image: 
                        linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
                    background-size: 50px 50px;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: -1;
                }
                /* Tailwind utility shims */
                .flex { display: flex; }
                .justify-between { justify-content: space-between; }
                .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
                .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
                .border-b { border-bottom-width: 1px; }
                .border-white\/5 { border-color: rgba(255, 255, 255, 0.05); }
                .text-white\/60 { color: rgba(255, 255, 255, 0.6); }
                .text-sm { font-size: 0.875rem; }
                .text-base { font-size: 1rem; }
                .text-lg { font-size: 1.125rem; }
                .font-bold { font-weight: 700; }
                .min-h-screen { min-height: 100vh; }
                .items-center { align-items: center; }
                .justify-center { justify-content: justify-center; }
                .bg-black { background-color: #000; }
                .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
                .p-6 { padding: 1.5rem; }
                .p-12 { padding: 3rem; }
                .max-w-7xl { max-width: 80rem; }
                .mx-auto { margin-left: auto; margin-right: auto; }
                .mb-16 { margin-bottom: 4rem; }
                .text-4xl { font-size: 2.25rem; }
                .text-6xl { font-size: 3.75rem; }
                .tracking-tighter { letter-spacing: -0.05em; }
                .mb-2 { margin-bottom: 0.5rem; }
                .text-white\/40 { color: rgba(255, 255, 255, 0.4); }
                .tracking-\[0\.3em\] { letter-spacing: 0.3em; }
                .font-medium { font-weight: 500; }
                .max-w-3xl { max-width: 48rem; }
                .mb-8 { margin-bottom: 2rem; }
                .mb-4 { margin-bottom: 1rem; }
                .mb-12 { margin-bottom: 3rem; }
                .text-2xl { font-size: 1.5rem; }
                .leading-tight { line-height: 1.25; }
                .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
                .space-y-2 > * + * { margin-top: 0.5rem; }
                .grid { display: grid; }
                .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
                .gap-6 { gap: 1.5rem; }
                .group:hover .group-hover\:text-white { color: white; }
                .group:hover .group-hover\:translate-x-1 { transform: translateX(0.25rem); }
                .transition-all { transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
                .transition-colors { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
                .transition-transform { transition-property: transform; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
                .duration-500 { transition-duration: 500ms; }
                .duration-700 { transition-duration: 700ms; }
            `}</style>
        </main>
    );
}
