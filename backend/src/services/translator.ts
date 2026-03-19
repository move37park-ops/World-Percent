import * as deepl from 'deepl-node';
import dotenv from 'dotenv';

dotenv.config();

const authKey = process.env.DEEPL_API_KEY || '';
const translator = new deepl.Translator(authKey);
const EXCHANGE_RATE = 1400;

export const translateToKorean = async (text: string): Promise<string> => {
    if (!text) return '';
    if (!authKey) {
        console.warn('DeepL API Key missing, falling back to original text');
        return convertDollarToKrw(text);
    }

    try {
        const result = await translator.translateText(text, null, 'ko');
        return convertDollarToKrw(result.text);
    } catch (error) {
        console.error('DeepL Translation error:', error);
        return convertDollarToKrw(text); // Fallback to original text but with conversion
    }
};

function convertDollarToKrw(text: string): string {
    return text.replace(/\$([\d,]+(?:\.\d+)?)\s*(k|m|b|t|million|billion)?/gi, (match, num, unit) => {
        let value = parseFloat(num.replace(/,/g, ''));
        if (unit) {
            const u = unit.toLowerCase();
            if (u === 'k') value *= 1000;
            else if (u === 'm' || u === 'million') value *= 1000000;
            else if (u === 'b' || u === 'billion') value *= 1000000000;
            else if (u === 't' || u === 'trillion') value *= 1000000000000;
        }
        const krw = value * EXCHANGE_RATE;
        if (krw >= 1000000000000) return `${match}(${(krw / 1000000000000).toFixed(1)}조원)`;
        if (krw >= 100000000) return `${match}(${(krw / 100000000).toFixed(1)}억원)`;
        if (krw >= 10000) return `${match}(${(krw / 10000).toFixed(1)}만원)`;
        return `${match}(${Math.round(krw).toLocaleString()}원)`;
    });
}
