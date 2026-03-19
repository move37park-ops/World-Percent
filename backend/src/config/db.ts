import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let dbInstance: Database | null = null;

export const initDB = async () => {
    if (!dbInstance) {
        dbInstance = await open({
            filename: './database.sqlite',
            driver: sqlite3.Database
        });

        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS markets (
                id TEXT PRIMARY KEY,
                polymarket_id TEXT UNIQUE,
                title TEXT,
                original_title TEXT,
                translated_title TEXT,
                outcomes TEXT, 
                translated_outcomes TEXT,
                category TEXT,
                volume REAL,
                end_date TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('SQLite DB Initialized');
    }
    return dbInstance;
};

export const getDB = async () => {
    if (!dbInstance) {
        return await initDB();
    }
    return dbInstance;
};
