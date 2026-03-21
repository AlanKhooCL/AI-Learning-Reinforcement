require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const creds = require('./google-credentials.json');

// --- 1. Configuration ---
const SPREADSHEET_ID = '1nWHsfEHSl17zJN13DnnYdoBqtYKmVPuuUcxS2DtkFdw';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors()); 
app.use(express.json());

// --- 2. The Core Logic ---
const generationConfig = {
    temperature: 0.2, 
    responseMimeType: "application/json" 
};

async function generateCards(targetTopic, requestedModel) {
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
    const existingCard = cachedRows.find(row => row.get('Ref_ID') === targetTopic);

    if (existingCard) {
        console.log(`✅ Served "${targetTopic}" directly from Sheets cache.`);
        return JSON.parse(existingCard.get('JSON_Payload'));
    }

    // Gather Content
    const subChapterRows = await subChaptersSheet.getRows();
    
    // The "Fuzzy Matcher"
    const targetSubChapter = subChapterRows.find(row => {
        const sheetTitle = row.get('SubChapter Title') || "";
        const cleanSheetTitle = sheetTitle.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const cleanTargetTopic = targetTopic.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        return cleanSheetTitle === cleanTargetTopic;
    });

    let sourceMaterial = "Explain this topic generally.";
    let sourceType = "Ad-Hoc";

    if (targetSubChapter) {
        sourceMaterial = targetSubChapter.get('Content') || "No content found in this cell."; 
        sourceType = "LMS";
    }

    // Sanity Check Logs
    console.log(`\n🔍 TARGET TOPIC: "${targetTopic}"`);
    console.log(`📖 CONTENT GRABBED: "${sourceMaterial.substring(0, 150)}..."\n`);

    // Call Gemini
    console.log(`🤖 Generating cards using model: ${requestedModel}...`);
    const model = genAI.getGenerativeModel({ 
        model: requestedModel,
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

    // Strip markdown formatting
    let generatedJSON = result.response.text();
    const cleanJSON = generatedJSON.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Save to Database
    await cardsSheet.addRow({
        Ref_ID: targetTopic,
        Source: sourceType,
        JSON_Payload: cleanJSON
    });

    console.log(`💾 Saved "${targetTopic}" to database.`);
    return JSON.parse(cleanJSON);
}

// --- 3. The API Endpoints ---

// Endpoint 1: Get Grouped Curriculum (Relational)
app.get('/api/topics', async (req, res) => {
    try {
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();

        const coursesSheet = doc.sheetsByTitle['Courses'];
        const chaptersSheet = doc.sheetsByTitle['Chapters'];
        const subChaptersSheet = doc.sheetsByTitle['SubChapters'];

        const [courseRows, chapterRows, subChapterRows] = await Promise.all([
            coursesSheet.getRows(),
            chaptersSheet.getRows(),
            subChaptersSheet.getRows()
        ]);

        const courseMap = {}; 
        courseRows.forEach(row => {
            courseMap[row.get('CourseID')] = row.get('Course Title');
        });

        const chapterMap = {}; 
        chapterRows.forEach(row => {
            chapterMap[row.get('ChapterID')] = {
                title: row.get('Chapter Title'),
                courseId: row.get('CourseID')
            };
        });

        const curriculum = {};

        subChapterRows.forEach(row => {
            const subChapterTitle = row.get('SubChapter Title');
            const chapterId = row.get('ChapterID');

            if (!subChapterTitle || !chapterId) return; 

            const parentChapter = chapterMap[chapterId];
            if (!parentChapter) return; 

            const chapterTitle = parentChapter.title || 'Unknown Chapter';
            const courseTitle = courseMap[parentChapter.courseId] || 'Unknown Course';

            if (!curriculum[courseTitle]) curriculum[courseTitle] = {};
            if (!curriculum[courseTitle][chapterTitle]) curriculum[courseTitle][chapterTitle] = [];

            curriculum[courseTitle][chapterTitle].push(subChapterTitle);
        });

        res.json(curriculum);
    } catch (error) {
        console.error("❌ Error fetching topics:", error);
        res.status(500).json({ error: "Failed to load curriculum" });
    }
});

// Endpoint 2: Generate/Fetch Cards
app.get('/api/learn/:topic', async (req, res) => {
    const topic = req.params.topic;
    const requestedModel = req.query.model || "gemini-2.5-flash"; 
    
    try {
        const data = await generateCards(topic, requestedModel); 
        res.json(data); 
    } catch (error) {
        console.error("❌ API Error:", error);
        res.status(500).json({ error: "Something went wrong generating the cards." });
    }
});

// --- 4. Start the Server ---
const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => {
    console.log(`🚀 AI Learning Reinforcement is running on port ${PORT}!`);
});
