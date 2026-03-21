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

// --- 2. The Core Logic ---
const generationConfig = {
    temperature: 0.2, // slightly warmed up to prevent robotic looping
    responseMimeType: "application/json" 
    // Notice we removed responseSchema. We will enforce structure in the text prompt instead.
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
    
    // The "Fuzzy Matcher" - Removes all spaces and weird characters before comparing
    const targetSubChapter = subChapterRows.find(row => {
        const sheetTitle = row['SubChapter Title'] || "";
        
        // Strip out everything except actual letters and numbers
        const cleanSheetTitle = sheetTitle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const cleanTargetTopic = targetTopic.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        return cleanSheetTitle === cleanTargetTopic;
    });

    let sourceMaterial = "Explain this topic generally.";
    let sourceType = "Ad-Hoc";

    if (targetSubChapter) {
        sourceMaterial = targetSubChapter.Content || "No content found in this cell."; 
        sourceType = "LMS";
    }

    // THE SANITY CHECK: Print what we found to the Render logs
    console.log(`\n🔍 TARGET TOPIC: "${targetTopic}"`);
    console.log(`📖 CONTENT GRABBED: "${sourceMaterial.substring(0, 150)}..."\n`);

    // Call Gemini with a strict JSON template instead of a schema object
    console.log(`🤖 Generating cards...`);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: `You are a data API. Read the provided Topic and Source Material, and convert it into the exact JSON structure below. DO NOT output markdown formatting, backticks, or conversational text. Output pure JSON only.

        {
          "chapterTitle": "Short Title Here",
          "cards": [
            {
              "type": "concept",
              "heading": "Main Idea",
              "content": "Summarize the core concept in 2 or 3 sentences."
            },
            {
              "type": "analogy",
              "heading": "Analogy",
              "content": "Create a real-world analogy for the concept.",
              "visualEmoji": "💡"
            },
            {
              "type": "quiz",
              "question": "One multiple choice question based on the material?",
              "options": [
                { "text": "Correct Answer", "isCorrect": true },
                { "text": "Wrong Answer", "isCorrect": false },
                { "text": "Wrong Answer", "isCorrect": false }
              ]
            }
          ]
        }`
    });

    const prompt = `Topic: ${targetTopic}\nSource Material: ${sourceMaterial}`;
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: generationConfig
    });

    // Strip out any accidental markdown backticks
    let generatedJSON = result.response.text();
    const cleanJSON = generatedJSON.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Save to Cache
    await cardsSheet.addRow({
        Ref_ID: targetTopic,
        Source: sourceType,
        JSON_Payload: cleanJSON
    });

    console.log(`💾 Saved "${targetTopic}" to database.`);
    return JSON.parse(cleanJSON);
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
