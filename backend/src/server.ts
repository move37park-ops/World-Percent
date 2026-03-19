import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { marketRouter } from './routes/market';
import { initDB } from './config/db';
import { startWorker } from './services/worker';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Terminal26 Backend Running with Cron and SQLite (No WS)');
});

app.use('/api/markets', marketRouter);

initDB().then(() => {
    startWorker();
    
    app.listen(Number(port), '0.0.0.0', () => {
        console.log(`Server is running at http://0.0.0.0:${port}`);
        console.log(`Backend is purely a REST API now.`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
});
