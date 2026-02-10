import axios from 'axios';

const POLYMARKET_API_URL = 'https://gamma-api.polymarket.com/events';

const queries = [
    // Macro
    "How many Fed rate cuts in 2026?",
    "AI bubble burst by...?",
    "Fed decision in March?",
    "Will Trump acquire Greenland before 2027?",
    "Russia x Ukraine ceasefire by March 31, 2026?",
    "Russia x Ukraine ceasefire by end of 2026?",
    "Will China invade Taiwan by end of 2026?",
    "Bitcoin vs. Gold vs. S&P 500 in 2026",

    // Stock
    "Largest Company end of March?",
    "Largest Company end of June?",
    "Largest Company end of December 2026?",

    // Crypto
    "What price will Bitcoin hit in February?",
    "What price will Ethereum hit in February?",
    "What price will Solana hit in February?",
    "What price will Bitcoin hit in 2026?",
    "What price will Ethereum hit in 2026?"
];

async function findMarkets() {
    try {
        console.log("Testing fetch by IDs...");
        // Test with first 3 macro IDs
        const ids = "51456,85299,67284";

        // Try 'ids' or 'id' parameter
        const response = await axios.get(POLYMARKET_API_URL, {
            params: {
                id: ids, // Trying 'id' with comma separated
                active: true,
                closed: false
            }
        });

        if (response.data.length > 0) {
            console.log(`Fetched ${response.data.length} markets using 'id' param.`);
            response.data.forEach((m: any) => console.log(`  - [${m.id}] ${m.title}`));
        } else {
            console.log("No markets found with 'id' param. Trying 'ids'...");
            const response2 = await axios.get(POLYMARKET_API_URL, {
                params: {
                    ids: ids, // Trying 'ids'
                    active: true,
                    closed: false
                }
            });
            if (response2.data.length > 0) {
                console.log(`Fetched ${response2.data.length} markets using 'ids' param.`);
                response2.data.forEach((m: any) => console.log(`  - [${m.id}] ${m.title}`));
            } else {
                console.log("Failed to fetch by IDs.");
            }
        }

    } catch (error) {
        console.error(`Error testing IDs`, error);
    }
}

findMarkets();
