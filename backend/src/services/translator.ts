import { translate } from '@vitalets/google-translate-api';

export const translateToKorean = async (text: string): Promise<string> => {
    try {
        const { text: translatedText } = await translate(text, { to: 'ko' });
        return translatedText;
    } catch (error) {
        console.error('Translation error:', error);
        return text; // Fallback to original text
    }
};
