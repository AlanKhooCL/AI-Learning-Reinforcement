require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const creds = require('./google-credentials.json');

// --- 1. Configuration ---
const SPREADSHEET_ID = '1nWHsfEHSl17zJN13DnnYdoBqtYKmVPuuUcxS2DtkFdw'; // <-- PASTE YOUR ID HERE
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors()); // Allows your frontend to securely request data
app.use(express.json());

// --- 2. The Core Logic (From your successful test) ---
const generationConfig = {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: {
        type: "OBJECT",
        properties: {
            chapterTitle: { type: "STRING" },
            cards: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        type: { type: "STRING" },
                        heading: { type: "STRING" },
                        content: { type: "STRING" },
                        visualEmoji: { type: "STRING" }, 
                        question: { type: "STRING" },    
                        options: {                       
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    text: { type: "STRING" },
                                    isCorrect: { type: "BOOLEAN" }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

async function generateCards(targetTopic) {
    const serviceAccountAuth = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    const subChaptersSheet = doc.sheetsByTitle['SubChapters'];
    const cardsSheet = doc.sheetsByTitle['Reinforcement_Cards'];

    // Check Cache
    const cachedRows = await cardsSheet.getRows();
    const existingCard = cachedRows.find(row => row.Ref_ID === targetTopic);

    if (existingCard) {
        console.log(`✅ Served "${targetTopic}" directly from Sheets cache.`);
        return JSON.parse(existingCard.JSON_Payload);
    }

    // Gather Content
    const subChapterRows = await subChaptersSheet.getRows();
    const targetSubChapter = subChapterRows.find(row => row['SubChapter Title'] === targetTopic);

    let sourceMaterial = "General knowledge.";
    let sourceType = "Ad-Hoc";

    if (targetSubChapter) {
        sourceMaterial = targetSubChapter.Content;
        sourceType = "LMS";
    }

    // Call Gemini
    console.log(`🤖 Generating new AI cards for: "${targetTopic}"...`);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: `You are an expert instructional designer. Your ONLY job is to take a topic and output a strict JSON object. Do NOT add any conversational text. Do NOT hallucinate repetitive text.

        CRITICAL WORD LIMITS:
        - The 'chapterTitle' MUST be 5 words or less.
        - The 'heading' for any card MUST be 10 words or less.
        - The 'content' for any card MUST be 40 words or less.
        - The 'visualEmoji' MUST be exactly 1 emoji.
        
        The cards array MUST contain exactly 3 objects:
        1. type: "concept"
        2. type: "analogy"
        3. type: "quiz" (with 3 options)
        
        If you repeat a phrase more than twice, you have failed.`
    });

    const prompt = `Topic: ${targetTopic}\nSource Material: ${sourceMaterial}`;
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: generationConfig
    });

    const generatedJSON = result.response.text();

    // Save to Cache
    await cardsSheet.addRow({
        Ref_ID: targetTopic,
        Source: sourceType,
        JSON_Payload: generatedJSON
    });

    console.log(`💾 Saved "${targetTopic}" to database.`);
    return JSON.parse(generatedJSON);
}

// --- 3. The API Endpoints ---

// This is the route your frontend will call!
app.get('/api/learn/:topic', async (req, res) => {
    try {
        // Grab the topic from the URL
        const requestedTopic = req.params.topic; 
        
        // Call your mighty function
        const data = await generateCards(requestedTopic); 
        
        // Send the JSON back to the frontend
        res.json(data); 
    } catch (error) {
        console.error("❌ API Error:", error);
        res.status(500).json({ error: "Something went wrong generating the cards." });
    }
});

// --- 4. Start the Server ---
const PORT = process.env.PORT || 3000; // Render will inject its own port here
app.listen(PORT, () => {
    console.log(`🚀 AI Learning Reinforcement is running on port ${PORT}!`);
});
