const questions = [
    // Domain A: Demandingness & Standards
    {
        id: 1,
        text: "I believe my child should follow the coach's directions immediately during games/practice, even if they don't agree.",
        category: 'A'
    },
    {
        id: 2,
        text: "I set strict rules regarding sleep, nutrition, and practice attendance.",
        category: 'A'
    },
    {
        id: 3,
        text: "I encourage my child to express their opinion if they disagree with me or their coach.",
        category: 'A'
    },
    {
        id: 4,
        text: "I often allow my child to skip practice if they are feeling 'lazy' or unmotivated.",
        category: 'A'
    },
    {
        id: 5,
        text: "I expect my child to perform at a high level because of the financial investment we have made.",
        category: 'A'
    },

    // Domain B: Responsiveness & Warmth
    {
        id: 6,
        text: "I can tell when my child is stressed about a game, even if they don't say anything.",
        category: 'B'
    },
    {
        id: 7,
        text: "I show warmth and pride in my child regardless of the game's outcome.",
        category: 'B'
    },
    {
        id: 8,
        text: "I tend to be quiet or act distant towards my child after they play poorly.",
        category: 'B'
    },
    {
        id: 9,
        text: "I know the names of my child's teammates and their parents.",
        category: 'B'
    },
    {
        id: 10,
        text: "I make an effort to have conversations with my child that are not about sports.",
        category: 'B'
    },

    // Domain C: Motivational Climate
    {
        id: 11,
        text: "It is important to me that my child is recognized as one of the best players on the team.",
        category: 'C'
    },
    {
        id: 12,
        text: "I focus my praise on my child's effort and improvement rather than the final score.",
        category: 'C'
    },
    {
        id: 13,
        text: "I get very nervous or visibly upset when the referee makes a bad call against my child's team.",
        category: 'C'
    },
    {
        id: 14,
        text: "I believe that winning is the most important thing in competitive sports.",
        category: 'C'
    },
    {
        id: 15,
        text: "I often help my child analyze their mistakes in the car immediately after the game.",
        category: 'C'
    },

    // Domain D: Autonomy Support
    {
        id: 16,
        text: "I encourage my child to try different sports and activities (or did when they were younger).",
        category: 'D'
    },
    {
        id: 17,
        text: "I allow my child to communicate directly with the coach regarding playing time or missed practices.",
        category: 'D'
    },
    {
        id: 18,
        text: "I usually pack my child's bag and prepare their water bottle to ensure they are ready.",
        category: 'D'
    },
    {
        id: 19,
        text: "I feel that my child's success in sports is a reflection of my success as a parent.",
        category: 'D'
    },
    {
        id: 20,
        text: "I support my child's decision if they choose to quit a sport they no longer enjoy.",
        category: 'D'
    }
];

const archetypes = {
    developer: {
        title: "THE ELITE DEVELOPER",
        desc: "You set high standards but provide the emotional safety net required to reach them. You support autonomy and separate your ego from the child's performance. This style is linked to high resilience and long-term athlete success.",
        action: "CONTINUE THE PATH"
    },
    pressure: {
        title: "THE PRESSURE COOKER",
        desc: "You care deeply but may be expressing it through control. Your child likely feels their worth is tied to the scoreboard, which can lead to anxiety and burnout. It's time to decouple love from performance.",
        action: "LEARN THE '24-HOUR RULE'"
    },
    enabler: {
        title: "THE BENEVOLENT ENABLER",
        desc: "You want your child to be happy, but you may be shielding them from necessary struggles. Without facing adversity, your athlete may lack the 'grit' needed for the next level.",
        action: "STEP BACK & LET THEM FAIL"
    },
    investor: {
        title: "THE OVER-INVESTED",
        desc: "You may view sport as a financial transaction. This creates a high-pressure environment where every error feels like a wasted dollar. This is a primary driver of athlete dropout.",
        action: "RETHINK THE ROI"
    }
};

let currentQuestion = 0;
let answers = {}; // Store raw answers (1-5)

function startAudit() {
    document.getElementById('audit-intro').classList.remove('active');
    document.getElementById('audit-question').classList.add('active');
    renderQuestion();
}

function renderQuestion() {
    const q = questions[currentQuestion];

    // Update Progress
    const progress = ((currentQuestion) / questions.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
    document.getElementById('current-question-num').innerText = currentQuestion + 1;
    document.getElementById('total-question-num').innerText = questions.length;

    // Update Text
    const textEl = document.getElementById('question-text');
    textEl.style.opacity = 0;
    setTimeout(() => {
        textEl.innerText = q.text;
        textEl.style.opacity = 1;
    }, 200);

    // Render Options (Likert 1-5)
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';

    const likertOptions = [
        { val: 1, text: "Strongly Disagree" },
        { val: 2, text: "Disagree" },
        { val: 3, text: "Neutral" },
        { val: 4, text: "Agree" },
        { val: 5, text: "Strongly Agree" }
    ];

    likertOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        // Premium styling for Likert with Number Circle
        btn.innerHTML = `
            <span class="opt-letter">${opt.val}</span>
            <span style="font-size: 1.1rem; font-weight: 500;">${opt.text}</span>
        `;
        btn.onclick = () => handleAnswer(opt.val);
        optionsContainer.appendChild(btn);
    });
}

function handleAnswer(value) {
    const q = questions[currentQuestion];
    answers[q.id] = value;

    if (currentQuestion < questions.length - 1) {
        currentQuestion++;
        renderQuestion();
    } else {
        finishAudit();
    }
}

function finishAudit() {
    document.getElementById('audit-question').classList.remove('active');
    document.getElementById('audit-loading').classList.add('active');

    // Calculate Results based on Scoring Key
    // Authoritarian Potential: Sum items 1, 8, 11, 13, 14, 19.
    // Authoritative/Supportive Potential: Sum items 2, 3, 6, 7, 10, 12, 17, 20.
    // Permissive/Enabling Potential: Sum items 4, 18.
    // Parental Conditional Regard (PCR) Indicators: Items 5, 8, 15, 19.

    // Helper to get score or 0
    const get = (id) => answers[id] || 0;

    const scores = {
        authoritarian: get(1) + get(8) + get(11) + get(13) + get(14) + get(19),
        authoritative: get(2) + get(3) + get(6) + get(7) + get(10) + get(12) + get(17) + get(20),
        permissive: get(4) + get(18),
        pcr: get(5) + get(8) + get(15) + get(19)
    };

    // Max potential scores
    const max = {
        authoritarian: 6 * 5, // 30
        authoritative: 8 * 5, // 40
        permissive: 2 * 5,    // 10
        pcr: 4 * 5           // 20
    };

    // Calculate percentage match
    const percent = {
        authoritarian: scores.authoritarian / max.authoritarian,
        authoritative: scores.authoritative / max.authoritative,
        permissive: scores.permissive / max.permissive,
        pcr: scores.pcr / max.pcr
    };

    // Logic for Archetype Determination
    let result = 'developer'; // Default

    // Logic:
    // 1. Check for "Over-Invested" risk (High PCR/Authoritarian + specifically Item 5 ROI)
    // If Item 5 is High (4 or 5) AND PCR is High (> 60%), flag as Investor
    if (get(5) >= 4 && percent.pcr > 0.6) {
        result = 'investor';
    }
    // 2. Check for "Benevolent Enabler" (High Permissive)
    else if (percent.permissive > 0.6 && percent.permissive > percent.authoritative) {
        result = 'enabler';
    }
    // 3. Check for "Pressure Cooker" (High Authoritarian or PCR, but not Investor)
    else if (percent.authoritarian > 0.6 || percent.pcr > 0.6) {
        result = 'pressure';
    }
    // 4. Else, if Authoritative is decent, or default
    else {
        result = 'developer';
    }

    setTimeout(() => {
        showResult(result, percent);
    }, 2000);
}

function showResult(type, stats) {
    document.getElementById('audit-loading').classList.remove('active');
    document.getElementById('audit-result').classList.add('active');

    const data = archetypes[type];
    document.getElementById('archetype-title').innerText = data.title;
    document.getElementById('archetype-desc').innerText = data.desc;
    document.querySelector('.btn-primary').innerText = data.action;

    // Update Score Circle text
    document.getElementById('final-score').innerText = "?";
    // Maybe show a graphical icon or just the Initials? 
    // Let's hide the numeric score elements and just show an Icon

    // Customizing the score circle for this quiz
    const wrapper = document.querySelector('.score-value-wrapper');
    wrapper.innerHTML = `<span style="font-size:3rem;">${getIcon(type)}</span>`;
}

function getIcon(type) {
    if (type === 'developer') return '🌱';
    if (type === 'pressure') return '🔥';
    if (type === 'enabler') return '🛑';
    if (type === 'investor') return '💸';
    return '❓';
}
