const axios = require('axios');

async function testApi() {
    try {
        const response = await axios.get('http://localhost:3000/api/markets');
        console.log('API Response Status:', response.status);
        console.log('Markets fetched:', response.data.length);
        if (response.data.length > 0) {
            console.log('Sample Market:', JSON.stringify(response.data[0], null, 2));
        }
    } catch (error) {
        console.error('API Test Failed:', error.message);
    }
}

testApi();
