// --- 1. Environment Setup ---
// When testing locally, use localhost. When live on Render, use your Render URL.
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : 'https://ai-learning-reinforcement.onrender.com'; // UPDATE THIS LATER BEFORE DEPLOYING

const feed = document.getElementById('feed');

// --- 2. Fetch the Data ---
async function fetchLearningCards(topic) {
    // Clear the feed and show a lo-fi loading state
    feed.innerHTML = `
        <section class="card">
            <div class="card-content">
                <h2>🎧 Tuning in...</h2>
                <p>Generating cards for ${topic}</p>
            </div>
        </section>
    `;

    try {
        const response = await fetch(`${API_BASE_URL}/api/learn/${encodeURIComponent(topic)}`);
        
        if (!response.ok) throw new Error("Failed to fetch cards");
        
        const data = await response.json();
        renderFeed(data);

    } catch (error) {
        console.error("Error:", error);
        feed.innerHTML = `
            <section class="card">
                <div class="card-content">
                    <h2>⚠️ Connection Lost</h2>
                    <p>Could not load the learning module.</p>
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
    attachScrollObserver();
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
// Let's hardcode a test topic for now to make sure the bridge works
fetchLearningCards('Defining AI: Machines That Think');
// Simple Quiz Logic
function checkAnswer(button, isCorrect) {
    // Disable all buttons in this specific quiz
    const siblings = button.parentElement.querySelectorAll('.quiz-btn');
    siblings.forEach(btn => btn.style.pointerEvents = 'none');

    if (isCorrect) {
        button.style.backgroundColor = '#a3c4a3'; // Soft green
        button.style.borderColor = '#a3c4a3';
        button.style.color = 'white';
        button.innerText += ' ✓';
        
        // Optional: Auto-scroll to next card after a brief delay
        setTimeout(() => {
            const currentCard = button.closest('.card');
            const nextCard = currentCard.nextElementSibling;
            if (nextCard) {
                nextCard.scrollIntoView({ behavior: 'smooth' });
            }
        }, 1000);
    } else {
        button.style.backgroundColor = '#d48a8a'; // Soft red
        button.style.borderColor = '#d48a8a';
        button.style.color = 'white';
        button.innerText += ' ✗';
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
