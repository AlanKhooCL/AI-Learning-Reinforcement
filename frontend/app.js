// --- 1. Environment Setup ---
// When testing locally, use localhost. When live on Render, use your Render URL.
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : 'https://ai-learning-reinforcement.onrender.com'; // UPDATE THIS LATER BEFORE DEPLOYING

const feed = document.getElementById('feed');

// --- 2. Fetch the Data ---
async function fetchLearningCards(topic) {
    // 1. GRAB THE MODEL FIRST (While it's still on screen!)
    const modelDropdown = document.getElementById('modelSelect');
    const selectedModel = modelDropdown ? modelDropdown.value : "gemini-2.5-flash"; 

    // 2. NOW clear the feed and show loading state
    feed.innerHTML = `
        <section class="card">
            <div class="card-content">
                <h2>🎧 Tuning in...</h2>
                <p>Generating cards for <strong>${topic}</strong></p>
                <p style="font-size: 0.8rem; opacity: 0.6;">Using: ${selectedModel}</p>
            </div>
        </section>
    `;

    try {
        // 3. Use the variable we already grabbed
        const response = await fetch(`${API_BASE_URL}/api/learn/${encodeURIComponent(topic)}?model=${selectedModel}`);
        
        if (!response.ok) throw new Error("Failed to fetch cards");
        
        const data = await response.json();
        console.log("🚨 DATA RECEIVED:", data); 

        renderFeed(data);

    } catch (error) {
        console.error("Error:", error);
        feed.innerHTML = `
            <section class="card">
                <div class="card-content">
                    <h2>⚠️ Connection Lost</h2>
                    <p>Could not load the module.</p>
                </div>
            </section>
        `;
    }
}

// --- 3. Render the TikTok UI ---
function renderFeed(data) {
    feed.innerHTML = ''; // Clear the loading message

    data.cards.forEach((card, index) => {
        let cardHTML = '';

        if (card.type === 'concept') {
            cardHTML = `
                <section class="card">
                    <div class="card-content">
                        <span class="tag">${data.chapterTitle} • Concept</span>
                        <h2>${card.heading}</h2>
                        <p>${card.content}</p>
                        ${index === 0 ? '<div class="swipe-hint">Swipe up <span>↑</span></div>' : ''}
                    </div>
                </section>`;
        } 
        else if (card.type === 'analogy') {
            cardHTML = `
                <section class="card">
                    <div class="card-content">
                        <span class="tag">${data.chapterTitle} • Analogy</span>
                        <h2>${card.heading}</h2>
                        <div class="visual-placeholder">${card.visualEmoji || '💡'}</div>
                        <p>${card.content}</p>
                    </div>
                </section>`;
        }
        else if (card.type === 'quiz') {
            // Map the options into clickable buttons
            const optionsHTML = card.options.map(opt => 
                `<button class="quiz-btn" onclick="checkAnswer(this, ${opt.isCorrect})">${opt.text}</button>`
            ).join('');

            cardHTML = `
                <section class="card">
                    <div class="card-content">
                        <span class="tag">${data.chapterTitle} • Quick Check</span>
                        <h2>${card.question}</h2>
                        <div class="quiz-options">
                            ${optionsHTML}
                        </div>
                    </div>
                </section>`;
        }

        feed.insertAdjacentHTML('beforeend', cardHTML);
    });

    // Add the final completion card
    feed.insertAdjacentHTML('beforeend', `
        <section class="card chapter-complete">
            <div class="card-content">
                <h2>☕ Chapter Complete!</h2>
                <button class="continue-btn" onclick="location.reload()">Back to Start</button>
            </div>
        </section>
    `);

    // Re-attach the observer for scroll tracking if needed
    //attachScrollObserver();
}

// --- 4. Quiz Logic ---
window.checkAnswer = function(button, isCorrect) {
    const siblings = button.parentElement.querySelectorAll('.quiz-btn');
    siblings.forEach(btn => btn.style.pointerEvents = 'none');

    if (isCorrect) {
        button.style.backgroundColor = '#a3c4a3';
        button.style.borderColor = '#a3c4a3';
        button.style.color = 'white';
        button.innerText += ' ✓';
        
        setTimeout(() => {
            const nextCard = button.closest('.card').nextElementSibling;
            if (nextCard) nextCard.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
    } else {
        button.style.backgroundColor = '#d48a8a';
        button.style.borderColor = '#d48a8a';
        button.style.color = 'white';
        button.innerText += ' ✗';
    }
}

// --- 5. Boot it up! ---

// --- 6. Menu Logic ---
const libraryBtn = document.getElementById('library-btn');
const closeMenuBtn = document.getElementById('close-menu-btn');
const menuOverlay = document.getElementById('menu-overlay');
const topicList = document.getElementById('topic-list');

// Open and Close menu
libraryBtn.addEventListener('click', () => {
    menuOverlay.classList.remove('menu-hidden');
    loadCurriculum(); // Fetch the list when opened
});

// Add this right below where you defined libraryBtn
const startBtn = document.getElementById('start-btn');

if (startBtn) {
    startBtn.addEventListener('click', () => {
        menuOverlay.classList.remove('menu-hidden');
        loadCurriculum(); 
    });
}

closeMenuBtn.addEventListener('click', () => {
    menuOverlay.classList.add('menu-hidden');
});

// Fetch and build the grouped curriculum menu
async function loadCurriculum() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/topics`);
        if (!response.ok) throw new Error("Failed to load topics");
        
        // This is now a nested object, not a flat array!
        const curriculum = await response.json();
        
        topicList.innerHTML = ''; 

        // Loop through the Courses
        for (const [courseName, chapters] of Object.entries(curriculum)) {
            const courseLi = document.createElement('li');
            courseLi.className = 'menu-course';
            courseLi.innerHTML = `📘 <strong>${courseName}</strong>`;
            topicList.appendChild(courseLi);

            // Loop through the Chapters inside this Course
            for (const [chapterName, subChapters] of Object.entries(chapters)) {
                const chapterLi = document.createElement('li');
                chapterLi.className = 'menu-chapter';
                chapterLi.innerHTML = `📂 ${chapterName}`;
                topicList.appendChild(chapterLi);

                // Loop through the SubChapters
                subChapters.forEach(subChapterTitle => {
                    const subLi = document.createElement('li');
                    subLi.className = 'menu-subchapter';
                    subLi.textContent = `📄 ${subChapterTitle}`;
                    
                    // The click event to fetch the cards!
                    subLi.addEventListener('click', () => {
                        menuOverlay.classList.add('menu-hidden'); 
                        fetchLearningCards(subChapterTitle);                
                    });
                    
                    topicList.appendChild(subLi);
                });
            }
        }

    } catch (error) {
        console.error("Error loading curriculum:", error);
        topicList.innerHTML = `<li style="color: red;">⚠️ Could not connect to database.</li>`;
    }
}

// Track when a user hits a new card (Useful for analytics/progress)
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            console.log("Viewing:", entry.target.querySelector('.tag')?.innerText || "Chapter Complete");
            // Here you would fire off an API call to save user progress
        }
    });
}, { threshold: 0.7 }); // Triggers when 70% of the card is visible

document.querySelectorAll('.card').forEach(card => {
    observer.observe(card);
});
