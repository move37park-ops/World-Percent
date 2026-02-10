import { translate } from '@vitalets/google-translate-api';

export const translateToKorean = async (text: string): Promise<string> => {
    try {
        // User requested to disable translation for now, but keeping the logic ready.
        // const { text: translatedText } = await translate(text, { to: 'ko' });
        // return translatedText;
        return text; // Return original English text as requested
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
};
