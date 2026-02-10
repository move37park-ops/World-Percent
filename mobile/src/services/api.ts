import axios from 'axios';
import { Platform } from 'react-native';

// Use your machine's local IP for physical devices (Expo Go)
const DEV_MACHINE_IP = '172.16.0.233';
const BASE_URL = Platform.OS === 'android'
    ? `http://${DEV_MACHINE_IP}:3000/api/markets`
    : `http://${DEV_MACHINE_IP}:3000/api/markets`;

export interface Market {
    id: string;
    title: string;
    originalTitle?: string;
    volume: number;
    markets: {
        id: string;
        question: string;
        outcomes: string; // JSON string usually
        outcomePrices: string; // JSON string
    }[];
}

export const fetchMarkets = async (category: string): Promise<Market[]> => {
    try {
        const response = await axios.get(`${BASE_URL}?category=${category}`, {
            timeout: 10000, // 10 seconds timeout
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        });
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('API Error:', error.message, error.code);
            if (error.code === 'ECONNABORTED') {
                console.log('Request timed out, retrying once...');
                try {
                    // Retry once with longer timeout
                    const retryResponse = await axios.get(`${BASE_URL}?category=${category}`, {
                        timeout: 15000
                    });
                    return retryResponse.data;
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                }
            }
        } else {
            console.error('Unexpected error:', error);
        }
        return [];
    }
};
