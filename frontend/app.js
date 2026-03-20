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
