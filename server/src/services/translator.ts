const DEEPL_API_KEY = process.env.DEEPL_API_KEY || '';

export const translateBatchToKorean = async (texts: string[]): Promise<string[]> => {
    if (!texts || texts.length === 0 || !DEEPL_API_KEY) return texts;
    try {
        const isFree = DEEPL_API_KEY.endsWith(':fx');
        const url = isFree ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: texts,
                target_lang: 'KO',
                formality: 'prefer_more'
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('DeepL API error:', errText);
            throw new Error(`DeepL API error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        return data.translations.map((t: any) => t.text);
    } catch (error) {
        console.error('Batch Translation error:', error);
        throw error; // Propagate error to avoid poisoning database with english text
    }
};

export const translateToKorean = async (text: string): Promise<string> => {
    const res = await translateBatchToKorean([text]);
    return res[0] || text;
};
