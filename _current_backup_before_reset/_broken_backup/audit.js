const questions = [
    {
        id: 1,
        question: "1. Missing Shots<br><span style='font-size: 0.9rem; opacity: 0.8; display: block; margin-top: 10px; font-weight: 400;'>You start the game missing 3 shots. You get the ball again. What do you do?</span>",
        options: [
            { text: "Pass it. I don't want to miss again.", score: 5 },
            { text: "Shoot it fast! I don't care if I miss.", score: 10 },
            { text: "Fake, take one dribble, and get a better shot.", score: 20 },
            { text: "Look at my parents in the stands.", score: 0 }
        ]
    },
    {
        id: 2,
        question: "2. Getting Ready<br><span style='font-size: 0.9rem; opacity: 0.8; display: block; margin-top: 10px; font-weight: 400;'>You are early to practice. The gym is empty. What do you do first?</span>",
        options: [
            { text: "Shoot crazy shots for fun.", score: 0 },
            { text: "Put on headphones and sit on the bench.", score: 5 },
            { text: "Tie my shoes tight and shoot close to the basket.", score: 20 },
            { text: "Play 1 on 1.", score: 10 }
        ]
    },
    {
        id: 3,
        question: "3. Coach Yells at You<br><span style='font-size: 0.9rem; opacity: 0.8; display: block; margin-top: 10px; font-weight: 400;'>Coach yells at you for a teammate's mistake and benches you. What do you do?</span>",
        options: [
            { text: "Sit down and look mad.", score: 0 },
            { text: "Tell the assistant coach it wasn't my fault.", score: 0 },
            { text: "Listen to the coach and stay ready. Don't show I'm mad.", score: 20 },
            { text: "Roll my eyes.", score: 0 }
        ]
    },
    {
        id: 4,
        question: "4. Bad Turnover<br><span style='font-size: 0.9rem; opacity: 0.8; display: block; margin-top: 10px; font-weight: 400;'>You lose the ball in a close game. The other team runs to score. What do you do?</span>",
        options: [
            { text: "Clap my hands and jog back.", score: 5 },
            { text: "Sprint back to stop them.", score: 20 },
            { text: "Look at the ref for a foul.", score: 0 },
            { text: "Drop my head.", score: 0 }
        ]
    },
    {
        id: 5,
        question: "5. Tiring Workout<br><span style='font-size: 0.9rem; opacity: 0.8; display: block; margin-top: 10px; font-weight: 400;'>You want to make 300 shots. You made 290, but you are super tired.</span>",
        options: [
            { text: "Finish fast so I can go home.", score: 0 },
            { text: "Stop now so I don't practice bad habits.", score: 10 },
            { text: "Take a break, then make 10 perfect shots.", score: 20 },
            { text: "Switch to free throws because they are easy.", score: 0 }
        ]
    }
];

let currentQuestion = 0;
let totalScore = 0;

function startQuiz() {
    document.getElementById('audit-intro').classList.remove('active');
    document.getElementById('audit-quiz').classList.add('active');
    renderQuestion();
}

function renderQuestion() {
    const q = questions[currentQuestion];
    const container = document.getElementById('question-container');
    const progressBar = document.getElementById('progress-bar');

    // Update Progress
    const progress = ((currentQuestion) / questions.length) * 100;
    progressBar.style.width = `${progress}%`;

    // Render HTML
    container.innerHTML = `
        <h2 class="question-text fade-in">${q.question}</h2>
        <div class="options-grid fade-in-up">
            ${q.options.map((opt, index) => `
                <button class="option-btn" onclick="selectOption(${opt.score})">
                    <span class="opt-letter">${String.fromCharCode(65 + index)}</span>
                    <span class="opt-text">${opt.text}</span>
                </button>
            `).join('')}
        </div>
    `;
}

function selectOption(score) {
    totalScore += score;
    currentQuestion++;

    // Small scroll to top for clarity on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (currentQuestion < questions.length) {
        setTimeout(() => renderQuestion(), 200); // Slight delay for feel
    } else {
        finishQuiz();
    }
}

function finishQuiz() {
    document.getElementById('audit-quiz').classList.remove('active');
    document.getElementById('audit-calculating').classList.add('active');

    // Fake Calculation Delay
    setTimeout(() => {
        document.getElementById('audit-calculating').classList.remove('active');
        document.getElementById('audit-gate').classList.add('active');
    }, 2000);
}

// Form Handling
document.getElementById('audit-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const nameInput = document.getElementById('audit-name');
    const emailInput = document.getElementById('audit-email');
    let isValid = true;

    // Validate Name
    if (!nameInput.value.trim()) {
        nameInput.classList.add('input-error');
        isValid = false;
    }

    // Validate Email
    if (!emailInput.value.trim() || !emailInput.value.includes('@')) {
        emailInput.classList.add('input-error');
        isValid = false;
    }

    if (!isValid) {
        // Shake animation replay trick if needed, or just focus first error
        if (nameInput.classList.contains('input-error')) nameInput.focus();
        else emailInput.focus();
        return;
    }

    showResult();
});

// Clear error on type
document.getElementById('audit-name').addEventListener('input', function () {
    this.classList.remove('input-error');
});

document.getElementById('audit-email').addEventListener('input', function () {
    this.classList.remove('input-error');
});

function showResult() {
    document.getElementById('audit-gate').classList.remove('active');
    document.getElementById('audit-result').classList.add('active');

    // Normalize Score (Max possible is 100)
    let finalScore = totalScore;
    if (finalScore < 0) finalScore = 0;

    // Animate Score
    animateValue('final-score', 0, finalScore, 1500);

    // Determine Archetype
    let title = "";
    let desc = "";
    let fix = "";

    if (finalScore >= 80) {
        // Result 1: D1 Prospect
        title = "THE D1 PROSPECT";
        desc = "You understand that basketball is 90% mental. You value the 'boring' details—footwork, spacing, bad calls, and defensive rotations. You don't play for highlights; you play for wins.";
        fix = "The Gap: You have the mindset, now you need the refined skill package to match it.";
    } else if (finalScore >= 40) {
        // Result 3: Gym Rat (The Grinder) - Renaming to Gym Rat as per request logic ordering (usually middle, though prompt put it as 3)
        // Prompt Order: 1=D1, 2=Highlight, 3=Gym Rat. 
        // Logic: Gym Rat is better than Highlight Hero (who is repellant). 
        // Let's assume Gym Rat is the "Try hard but fail" (Middle) and Highlight Hero is "Bad attitude" (Low).
        title = "THE GYM RAT";
        desc = "You work incredibly hard, but you might be working 'dumb.' You practice for hours but lack the emotional control or the IQ to translate that into game impact. You hesitate when you should shoot.";
        fix = "The Fix: You need confidence and 'Game IQ' training.";
    } else {
        // Result 2: Highlight Hero (The Repellant)
        title = "THE HIGHLIGHT HERO";
        desc = "You love the idea of being a hooper, but you might love the attention more than the grind. You look at the crowd when you miss. You care more about your shoes than your defensive stance.";
        fix = "The Fix: You need to humble yourself. Stop playing for the camera.";
    }

    document.getElementById('archetype-title').innerText = title;

    // Inject Description + Fix
    document.getElementById('archetype-desc').innerHTML = `
        ${desc} <br><br>
        <strong style="color: #0071e3;">${fix}</strong>
    `;
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}
