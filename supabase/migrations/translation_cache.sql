-- Translation Cache Table for DeepL Optimization
CREATE TABLE IF NOT EXISTS translation_cache (
    source_text TEXT PRIMARY KEY,
    translated_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
