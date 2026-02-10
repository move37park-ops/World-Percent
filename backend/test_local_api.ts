import axios from 'axios';

async function testApi() {
    try {
        console.log("Testing MACRO category...");
        const responseMacro = await axios.get('http://localhost:3000/api/markets?category=macro');
        console.log(`Macro items: ${responseMacro.data.length}`);
        responseMacro.data.forEach((m: any) => console.log(` - [${m.id}] ${m.title}`));

        console.log("\nTesting STOCK category...");
        const responseStock = await axios.get('http://localhost:3000/api/markets?category=stock');
        console.log(`Stock items: ${responseStock.data.length}`);
        responseStock.data.forEach((m: any) => console.log(` - [${m.id}] ${m.title}`));

    } catch (error) {
        console.error("Error testing API:", error);
    }
}

testApi();
