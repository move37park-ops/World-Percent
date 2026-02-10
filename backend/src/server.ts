import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { marketRouter } from './routes/market';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Terminal26 Backend Running');
});

app.use('/api/markets', marketRouter);

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
