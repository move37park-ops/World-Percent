const axios = require('axios');

async function testCategories() {
    const categories = ['macro', 'stock', 'crypto'];
    for (const cat of categories) {
        try {
            const response = await axios.get(`http://localhost:3000/api/markets?category=${cat}`);
            console.log(`--- Category: ${cat} ---`);
            console.log(`Count: ${response.data.length}`);
            response.data.slice(0, 5).forEach(m => console.log(`- ${m.title}`));
        } catch (e) {
            console.log(`${cat} failed: ${e.message}`);
        }
    }
}

testCategories();
