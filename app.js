import { firebaseConfig } from './firebase-config.js';

// --- INITIALIZATION ---
// Check if firebase is defined
if (typeof firebase === 'undefined') {
    console.error("Firebase SDK not loaded.");
    alert("Firebase SDK not loaded. Please check your internet connection.");
}

// Initialize Firebase
let app, database;
try {
    app = firebase.initializeApp(firebaseConfig);
    database = firebase.database();
} catch (e) {
    console.error("Firebase init error (is config missing?):", e);
}

// Global State Variables
let currentRoomCode = null;
let currentRole = null; // 'host', 'display', 'player'
let playerId = null;
let hostId = null;
let pendingRevealRow = -1;

// DOM Elements - General
const views = {
    landing: document.getElementById('landing-view'),
    host: document.getElementById('host-view'),
    display: document.getElementById('display-view'),
    player: document.getElementById('player-view')
};

// --- ROUTING ---
function initRouter() {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view') || 'landing';
    const roomParam = params.get('room');

    currentRoomCode = roomParam ? roomParam.toUpperCase() : null;

    // Hide all views
    Object.values(views).forEach(v => v.classList.remove('active'));

    if (viewParam === 'landing') {
        currentRole = null;
        views.landing.classList.add('active');
        initLanding();
    } else if (viewParam === 'host') {
        currentRole = 'host';
        views.host.classList.add('active');
        initHostView();
    } else if (viewParam === 'display') {
        currentRole = 'display';
        views.display.classList.add('active');
        initDisplayView();
    } else if (viewParam === 'player') {
        currentRole = 'player';
        views.player.classList.add('active');
        initPlayerView();
    } else {
        views.landing.classList.add('active');
    }
}

// --- LANDING LOGIC ---
function initLanding() {
    document.getElementById('host-btn').addEventListener('click', () => {
        window.location.href = '?view=host';
    });

    document.getElementById('display-btn').addEventListener('click', () => {
        openJoinModal('display');
    });

    document.getElementById('join-btn').addEventListener('click', () => {
        openJoinModal('player');
    });
}

function openJoinModal(targetRole) {
    const modal = document.getElementById('join-modal');
    modal.classList.add('active');
    document.getElementById('join-modal-title').textContent = targetRole === 'display' ? 'Open Display' : 'Join as Player';
    
    const fields = document.getElementById('player-join-fields');
    if (targetRole === 'player') {
        fields.classList.remove('hidden');
    } else {
        fields.classList.add('hidden');
    }

    const input = document.getElementById('join-room-input');
    input.value = '';
    document.getElementById('join-error-msg').textContent = '';
    
    // Cleanup previous listener
    const submitBtn = document.getElementById('submit-join-btn');
    const newBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newBtn, submitBtn);

    newBtn.addEventListener('click', () => handleJoinSubmit(targetRole));
}

document.getElementById('close-join-modal').addEventListener('click', () => {
    document.getElementById('join-modal').classList.remove('active');
});

async function handleJoinSubmit(targetRole) {
    const roomInput = document.getElementById('join-room-input').value.toUpperCase().trim();
    const errorMsg = document.getElementById('join-error-msg');
    
    if (roomInput.length !== 6) {
        errorMsg.textContent = "Room code must be 6 characters.";
        return;
    }

    // Check if room exists
    try {
        const snapshot = await database.ref(`feud-rooms/${roomInput}`).once('value');
        if (!snapshot.exists()) {
            errorMsg.textContent = "Room not found.";
            return;
        }

        const roomData = snapshot.val();

        if (targetRole === 'display') {
            window.location.href = `?view=display&room=${roomInput}`;
        } else if (targetRole === 'player') {
            const playerName = document.getElementById('player-name-input').value.trim();
            const teamSelect = document.getElementById('player-team-select').value;

            if (!playerName) {
                errorMsg.textContent = "Please enter your name.";
                return;
            }
            if (!teamSelect) {
                errorMsg.textContent = "Please select a team.";
                return;
            }

            // Create player
            const newPlayerId = "p_" + Math.random().toString(36).substr(2, 9);
            await database.ref(`feud-rooms/${roomInput}/players/${newPlayerId}`).set({
                name: playerName,
                team: teamSelect,
                buzzEligible: false,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            });

            localStorage.setItem(`feud_player_${roomInput}`, newPlayerId);
            window.location.href = `?view=player&room=${roomInput}`;
        }
    } catch (err) {
        errorMsg.textContent = "Error connecting to server.";
        console.error(err);
    }
}

// Populate teams dropdown when room code is entered (debounced)
document.getElementById('join-room-input').addEventListener('input', async (e) => {
    const code = e.target.value.toUpperCase();
    const teamSelect = document.getElementById('player-team-select');
    const fields = document.getElementById('player-join-fields');
    
    if (!fields.classList.contains('hidden') && code.length === 6) {
        try {
            const snap = await database.ref(`feud-rooms/${code}/teams`).once('value');
            if (snap.exists()) {
                const teams = snap.val();
                teamSelect.innerHTML = '<option value="" disabled selected>Select Team</option>';
                Object.keys(teams).forEach(t => {
                    if (teams[t].enabled) {
                        const opt = document.createElement('option');
                        opt.value = t;
                        opt.textContent = teams[t].name;
                        teamSelect.appendChild(opt);
                    }
                });
            }
        } catch(err) {
            console.error(err);
        }
    }
});

// --- AUDIO UTILS (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isMuted = false;

function playDing() {
    if (isMuted) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); // A6
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 1);
}

function playStrike() {
    if (isMuted) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.6);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.7);
}

function playRevealTop() {
    if (isMuted) return;
    playDing();
    setTimeout(() => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime); // C6
        osc.frequency.exponentialRampToValueAtTime(2093, audioCtx.currentTime + 0.2); // C7
        
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 1);
    }, 100);
}

function playSteal() {
    if (isMuted) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.3);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 1.2);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
}

// Color palette matching the design
const TEAM_COLORS = {
    A: { hex: '#00F5FF', name: 'Cyan' },
    B: { hex: '#FF2D87', name: 'Pink' },
    C: { hex: '#FFD93D', name: 'Yellow' },
    D: { hex: '#00E676', name: 'Green' },
    E: { hex: '#FF6B35', name: 'Orange' },
    F: { hex: '#B14EFF', name: 'Purple' },
    G: { hex: '#00BFA5', name: 'Teal' },
    H: { hex: '#FF4444', name: 'Red' }
};

// ==========================================
// HOST LOGIC
// ==========================================
let parsedQuestions = [];
let localGameState = {};

function initHostView() {
    if (currentRoomCode) {
        // Attempt to resume session
        hostId = localStorage.getItem(`feud_host_${currentRoomCode}`);
        if (hostId) {
            document.getElementById('host-setup').classList.add('hidden');
            document.getElementById('host-dashboard').classList.remove('hidden');
            attachHostListeners();
            return;
        }
    }

    // Generate room code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for(let i=0; i<6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    currentRoomCode = code;
    
    // Init Setup Screen
    const setupChips = document.getElementById('setup-team-chips');
    setupChips.innerHTML = '';
    Object.keys(TEAM_COLORS).forEach(letter => {
        const chip = document.createElement('div');
        chip.className = 'team-chip enabled';
        chip.dataset.letter = letter;
        chip.style.color = TEAM_COLORS[letter].hex;
        
        // Toggle button/indicator
        const toggleArea = document.createElement('span');
        toggleArea.className = 'team-chip-toggle';
        toggleArea.innerHTML = '●';
        
        // Editable input for name
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'team-chip-input';
        nameInput.value = `Team ${letter}`;
        nameInput.maxLength = 15;
        
        chip.appendChild(toggleArea);
        chip.appendChild(nameInput);
        
        // Toggle when clicking the circle (not the input)
        toggleArea.addEventListener('click', (e) => {
            chip.classList.toggle('enabled');
        });
        
        setupChips.appendChild(chip);
    });

    document.getElementById('download-template-btn').addEventListener('click', () => {
        if (typeof XLSX === 'undefined') {
            alert('SheetJS is still loading. Please try again in a moment.');
            return;
        }
        
        const data = [
            ["Question", "Ans 1", "Pts 1", "Ans 2", "Pts 2", "Ans 3", "Pts 3", "Ans 4", "Pts 4", "Ans 5", "Pts 5", "Ans 6", "Pts 6", "Ans 7", "Pts 7", "Ans 8", "Pts 8"],
            ["Name something you might find in a software engineer's desk.", "Coffee mug", 45, "Mechanical keyboard", 30, "Headphones", 15, "Rubber duck", 8, "Snacks", 2, "", "", "", "", "", ""],
            ["Name a popular programming language.", "JavaScript", 35, "Python", 25, "Java", 18, "C++", 10, "C#", 7, "Rust", 5, "", "", "", ""],
            ["Which cloud provider is the most widely used?", "AWS", 50, "Azure", 30, "Google Cloud", 20, "", "", "", "", "", "", "", "", "", ""]
        ];
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        ws['!cols'] = [{wch: 50}, {wch: 20}, {wch: 5}, {wch: 20}, {wch: 5}, {wch: 20}, {wch: 5}, {wch: 20}, {wch: 5}, {wch: 20}, {wch: 5}, {wch: 20}, {wch: 5}, {wch: 20}, {wch: 5}, {wch: 20}, {wch: 5}];
        
        XLSX.utils.book_append_sheet(wb, ws, "Questions");
        XLSX.writeFile(wb, "MechTechFeud_Template.xlsx");
    });

    document.getElementById('excel-upload').addEventListener('change', handleExcelUpload);
    document.getElementById('open-lobby-btn').addEventListener('click', openLobby);
}

function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        try {
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, {header: 1}); // Array of arrays
            
            parseExcelData(jsonData);
        } catch(err) {
            document.getElementById('upload-status').textContent = "Error reading Excel file.";
            document.getElementById('upload-status').className = "status-msg error";
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

function parseExcelData(rows) {
    parsedQuestions = [];
    let errors = [];
    
    // Row 0 is headers
    for(let i=1; i<rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0 || !r[0]) continue; // Skip empty rows
        
        const qText = String(r[0]).trim();
        let answers = [];
        
        // Loop through pairs (Ans 1, Pts 1, etc.) starting index 1
        for(let j=1; j<r.length; j+=2) {
            const aText = r[j] ? String(r[j]).trim() : '';
            const pts = r[j+1] ? parseInt(r[j+1]) : 0;
            
            if (aText && pts > 0) {
                answers.push({ text: aText, points: pts });
            }
        }
        
        if (answers.length < 3) {
            errors.push(`Row ${i+1}: Needs at least 3 valid answers.`);
        } else if (answers.length > 8) {
            errors.push(`Row ${i+1}: Maximum 8 answers allowed.`);
        } else {
            // Sort by points descending just to be safe
            answers.sort((a,b) => b.points - a.points);
            parsedQuestions.push({ qnum: parsedQuestions.length + 1, question: qText, answers: answers });
        }
    }
    
    const status = document.getElementById('upload-status');
    if (errors.length > 0) {
        status.innerHTML = errors.join('<br>');
        status.className = "status-msg error";
        document.getElementById('open-lobby-btn').disabled = true;
    } else if (parsedQuestions.length === 0) {
        status.textContent = "No valid questions found.";
        status.className = "status-msg error";
        document.getElementById('open-lobby-btn').disabled = true;
    } else {
        status.textContent = `✅ Parsed ${parsedQuestions.length} questions successfully.`;
        status.className = "status-msg";
        document.getElementById('open-lobby-btn').disabled = false;
        
        const previewList = document.getElementById('preview-list');
        previewList.innerHTML = '';
        parsedQuestions.forEach(q => {
            const li = document.createElement('li');
            li.textContent = `Q${q.qnum}: ${q.question} (${q.answers.length} answers)`;
            previewList.appendChild(li);
        });
        document.getElementById('questions-preview').classList.remove('hidden');
    }
}

async function openLobby() {
    hostId = "host_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(`feud_host_${currentRoomCode}`, hostId);
    
    // Prepare Teams
    const teams = {};
    document.querySelectorAll('.team-chip').forEach(chip => {
        const letter = chip.dataset.letter;
        const nameInput = chip.querySelector('.team-chip-input').value.trim() || `Team ${letter}`;
        teams[letter] = {
            name: nameInput,
            color: TEAM_COLORS[letter].hex,
            enabled: chip.classList.contains('enabled'),
            score: 0
        };
    });

    const roomRef = database.ref(`feud-rooms/${currentRoomCode}`);
    
    try {
        await roomRef.set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            hostId: hostId,
            status: "playing",
            questions: parsedQuestions,
            currentQuestionIdx: 0,
            displayMode: "intro",
            teams: teams,
            gameState: {
                currentTeam: Object.keys(teams).find(k => teams[k].enabled) || 'A',
                strikes: 0,
                buzzerMode: 'off',
                stealActive: false,
                stealingTeam: null
            },
            revealed: {},
            buzzes: {},
            history: []
        });

        document.getElementById('host-setup').classList.add('hidden');
        document.getElementById('host-dashboard').classList.remove('hidden');
        attachHostListeners();
    } catch (error) {
        console.error("Firebase write error:", error);
        alert("Failed to create the room. Have you updated the Realtime Database rules in Firebase to allow access to 'feud-rooms'?\n\nError: " + error.message);
    }
}

function attachHostListeners() {
    document.getElementById('host-room-code').textContent = currentRoomCode;
    
    const roomRef = database.ref(`feud-rooms/${currentRoomCode}`);
    
    // Listen to full state
    roomRef.on('value', (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        localGameState = data;
        renderHostDashboard(data);
    });

    // Host Controls Listeners
    document.getElementById('prev-q-btn').onclick = () => {
        if (localGameState.currentQuestionIdx > 0) {
            roomRef.update({
                currentQuestionIdx: localGameState.currentQuestionIdx - 1,
                displayMode: 'intro',
                'gameState/strikes': 0,
                'gameState/stealActive': false,
                'gameState/buzzerMode': 'off'
            });
        }
    };
    document.getElementById('next-q-btn').onclick = () => {
        if (localGameState.questions && localGameState.currentQuestionIdx < localGameState.questions.length - 1) {
            roomRef.update({
                currentQuestionIdx: localGameState.currentQuestionIdx + 1,
                displayMode: 'intro',
                'gameState/strikes': 0,
                'gameState/stealActive': false,
                'gameState/buzzerMode': 'off'
            });
        }
    };
    
    document.getElementById('intro-round-btn').onclick = () => {
        if (localGameState.displayMode === 'intro') {
            roomRef.update({ displayMode: 'board' });
        } else {
            roomRef.update({ displayMode: 'intro' });
        }
    };

    document.getElementById('filler-screen-btn').onclick = () => {
        roomRef.update({ displayMode: 'filler' });
    };

    document.getElementById('buzzer-master-toggle').onchange = (e) => {
        roomRef.update({ 'gameState/buzzerMode': e.target.value, buzzes: null });
    };
    
    document.getElementById('clear-buzz-btn').onclick = () => {
        roomRef.update({ buzzes: null });
    };

    document.getElementById('add-strike-btn').onclick = () => {
        let strikes = (localGameState.gameState.strikes || 0) + 1;
        if (strikes > 3) strikes = 3;
        
        roomRef.update({ 'gameState/strikes': strikes });
        
        // Log history
        const qnum = localGameState.currentQuestionIdx + 1;
        const team = localGameState.gameState.currentTeam;
        
        const historyRef = database.ref(`feud-rooms/${currentRoomCode}/history`).push();
        historyRef.set({
            type: 'strike', qnum, team, points: 0, timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        if (strikes >= 3 && !localGameState.gameState.stealActive) {
            // Prompt steal automatically
            if(confirm("3 Strikes! Start Steal Round?")) {
                document.getElementById('start-steal-btn').click();
            }
        }
    };

    document.getElementById('current-team-select').onchange = (e) => {
        roomRef.update({ 'gameState/currentTeam': e.target.value });
    };

    // Faceoff flow
    document.getElementById('apply-faceoff-btn').onclick = () => {
        const t1 = document.getElementById('faceoff-team-1').value;
        const t2 = document.getElementById('faceoff-team-2').value;
        if (t1 && t2 && t1 !== t2) {
            roomRef.update({ 'gameState/faceoffTeams': [t1, t2] });
        } else {
            alert("Please select two different teams.");
        }
    };
    document.getElementById('clear-faceoff-btn').onclick = () => {
        roomRef.update({ 'gameState/faceoffTeams': null });
    };

    // Steal flow
    document.getElementById('start-steal-btn').onclick = () => {
        const stealSelect = document.getElementById('steal-target-select');
        stealSelect.innerHTML = '';
        Object.keys(localGameState.teams).forEach(t => {
            if (localGameState.teams[t].enabled && t !== localGameState.gameState.currentTeam) {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = localGameState.teams[t].name;
                stealSelect.appendChild(opt);
            }
        });
        document.getElementById('steal-modal').classList.add('active');
    };

    document.getElementById('close-steal-modal').onclick = () => document.getElementById('steal-modal').classList.remove('active');
    
    document.getElementById('confirm-steal-btn').onclick = () => {
        const stealingTeam = document.getElementById('steal-target-select').value;
        roomRef.update({
            'gameState/stealActive': true,
            'gameState/stealingTeam': stealingTeam,
            'gameState/currentTeam': stealingTeam, // Auto set current team
            displayMode: 'steal'
        });
        document.getElementById('steal-modal').classList.remove('active');
        
        setTimeout(() => {
            roomRef.update({ displayMode: 'board' });
        }, 3000);
    };

    document.getElementById('end-steal-btn').onclick = () => {
        roomRef.update({
            'gameState/stealActive': false,
            'gameState/stealingTeam': null,
        });
    };

    document.getElementById('fail-steal-btn').onclick = () => {
        // Failed steal, just end steal state. The original team keeps their points.
        roomRef.update({
            'gameState/stealActive': false,
            'gameState/stealingTeam': null,
        });
        document.getElementById('fail-steal-btn').classList.add('hidden');
    };

    // Reveal flow
    document.getElementById('close-reveal-modal').onclick = () => document.getElementById('reveal-modal').classList.remove('active');

    document.getElementById('confirm-reveal-btn').onclick = async () => {
        const team = document.getElementById('reveal-team-select').value;
        await processReveal(pendingRevealRow, team);
        document.getElementById('reveal-modal').classList.remove('active');
    };
    document.getElementById('reveal-only-btn').onclick = async () => {
        await processReveal(pendingRevealRow, null);
        document.getElementById('reveal-modal').classList.remove('active');
    };
    
    // History & Scores
    document.getElementById('history-btn').onclick = () => {
        openHistoryModal();
    };
    document.getElementById('close-history-modal').onclick = () => document.getElementById('history-modal').classList.remove('active');

    // QR Code
    document.getElementById('qr-code-btn').onclick = () => {
        const url = `${window.location.origin}${window.location.pathname}?view=player&room=${currentRoomCode}`;
        QRCode.toCanvas(document.getElementById('qr-code-img'), url, { width: 250, margin: 1 });
        document.getElementById('qr-join-link').textContent = url;
        document.getElementById('qr-code-modal').classList.add('active');
    };
    document.getElementById('close-qr-modal').onclick = () => document.getElementById('qr-code-modal').classList.remove('active');
    
    document.getElementById('copy-room-code-btn').onclick = () => {
        navigator.clipboard.writeText(currentRoomCode);
        alert("Copied room code: " + currentRoomCode);
    };
}

async function processReveal(rowIdx, teamId) {
    const qnum = localGameState.currentQuestionIdx + 1;
    const qData = localGameState.questions[localGameState.currentQuestionIdx];
    const answer = qData.answers[rowIdx];
    const key = `${qnum}_${rowIdx}`;

    const updates = {};
    updates[`revealed/${key}`] = {
        answerText: answer.text,
        points: answer.points,
        awardedTo: teamId
    };

    // Add score
    if (teamId) {
        const currentScore = localGameState.teams[teamId].score || 0;
        let pointsToAdd = answer.points;
        
        // If steal is active, they steal ALL currently revealed points on board + this one
        if (localGameState.gameState.stealActive) {
            let totalStealPoints = answer.points;
            if (localGameState.revealed) {
                 Object.keys(localGameState.revealed).forEach(k => {
                    if (k.startsWith(`${qnum}_`) && k !== key) {
                         totalStealPoints += localGameState.revealed[k].points;
                    }
                 });
            }
            pointsToAdd = totalStealPoints;
            updates['gameState/stealActive'] = false; // End steal after guess
        }
        
        updates[`teams/${teamId}/score`] = currentScore + pointsToAdd;

        // Log history
        const historyRef = database.ref(`feud-rooms/${currentRoomCode}/history`).push();
        updates[`history/${historyRef.key}`] = {
            type: localGameState.gameState.stealActive ? 'steal' : 'reveal',
            qnum, team: teamId, points: pointsToAdd, timestamp: firebase.database.ServerValue.TIMESTAMP
        };
    } else if (localGameState.gameState.stealActive) {
        // Failed steal, end steal state
        updates['gameState/stealActive'] = false;
    }

    // Force board display
    updates['displayMode'] = 'board';

    await database.ref(`feud-rooms/${currentRoomCode}`).update(updates);
}

// History & Scores Modal Logic
function openHistoryModal() {
    if (!localGameState) return;
    const modal = document.getElementById('history-modal');
    modal.classList.add('active');
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.remove('hidden');
        };
    });

    renderLiveScoresTab();
    renderHistoryTab();
}

function renderLiveScoresTab() {
    const list = document.getElementById('history-scores-list');
    list.innerHTML = '';
    
    Object.keys(localGameState.teams).filter(t => localGameState.teams[t].enabled).forEach(t => {
        const team = localGameState.teams[t];
        const row = document.createElement('div');
        row.className = 'score-adjust-row';
        row.style.borderLeftColor = team.color;
        
        row.innerHTML = `
            <div>
                <strong>${team.name}</strong>
                <div style="color:var(--text-secondary); font-size:0.9rem;">Current: ${team.score || 0}</div>
            </div>
            <div class="score-adjust-controls">
                <button class="btn btn-gray adjust-btn" data-team="${t}" data-amt="-5">-5</button>
                <input type="number" class="score-adjust-input" id="score-input-${t}" value="${team.score || 0}">
                <button class="btn btn-gray adjust-btn" data-team="${t}" data-amt="5">+5</button>
                <button class="btn btn-cyan save-score-btn" data-team="${t}">Save</button>
            </div>
        `;
        list.appendChild(row);
    });

    // Event listeners
    list.querySelectorAll('.adjust-btn').forEach(btn => {
        btn.onclick = (e) => {
            const t = e.target.dataset.team;
            const amt = parseInt(e.target.dataset.amt);
            const input = document.getElementById(`score-input-${t}`);
            input.value = parseInt(input.value) + amt;
        };
    });

    list.querySelectorAll('.save-score-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const t = e.target.dataset.team;
            const val = parseInt(document.getElementById(`score-input-${t}`).value);
            if (!isNaN(val)) {
                await database.ref(`feud-rooms/${currentRoomCode}/teams/${t}/score`).set(val);
                
                // Add a manual history entry
                const historyRef = database.ref(`feud-rooms/${currentRoomCode}/history`).push();
                historyRef.set({
                    type: 'manual_edit', 
                    qnum: 'N/A', 
                    team: t, 
                    points: val - (localGameState.teams[t].score || 0), 
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
                
                // Keep modal open, it will re-render due to on('value') listener if we re-called render, but we don't automatically
                // Just flash green
                e.target.textContent = "Saved!";
                e.target.classList.replace('btn-cyan', 'btn-green');
                setTimeout(() => {
                    e.target.textContent = "Save";
                    e.target.classList.replace('btn-green', 'btn-cyan');
                }, 1000);
            }
        };
    });
}

function renderHistoryTab() {
    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = '';
    
    if (localGameState.history) {
        // Sort newest first
        const histArr = Object.keys(localGameState.history)
            .map(k => ({ id: k, ...localGameState.history[k] }))
            .sort((a,b) => b.timestamp - a.timestamp);
            
        histArr.forEach(entry => {
            const tr = document.createElement('tr');
            const d = new Date(entry.timestamp);
            const timeStr = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
            
            let teamCell = entry.team && localGameState.teams[entry.team] ? localGameState.teams[entry.team].name : entry.team;
            
            // Allow re-allocation for reveals
            if (entry.type === 'reveal' && entry.qnum !== 'N/A') {
                let options = `<option value="">--</option>`;
                Object.keys(localGameState.teams).filter(t => localGameState.teams[t].enabled).forEach(t => {
                    const sel = (t === entry.team) ? 'selected' : '';
                    options += `<option value="${t}" ${sel}>${localGameState.teams[t].name}</option>`;
                });
                
                teamCell = `<select class="history-reallocate-select" data-histid="${entry.id}" data-oldteam="${entry.team}" data-points="${entry.points}">${options}</select>`;
            }
            
            tr.innerHTML = `
                <td>${timeStr}</td>
                <td><span class="badge" style="background:var(--surface-color); padding:2px 5px; border-radius:3px;">${entry.type}</span></td>
                <td>${entry.qnum}</td>
                <td>${entry.points > 0 ? '+'+entry.points : entry.points}</td>
                <td>${teamCell}</td>
            `;
            tbody.appendChild(tr);
        });

        // Re-allocation logic
        tbody.querySelectorAll('.history-reallocate-select').forEach(sel => {
            sel.onchange = async (e) => {
                const histId = e.target.dataset.histid;
                const oldTeam = e.target.dataset.oldteam;
                const newTeam = e.target.value;
                const points = parseInt(e.target.dataset.points);
                
                if (oldTeam === newTeam) return;

                const updates = {};
                // Update history entry
                updates[`history/${histId}/team`] = newTeam;
                
                // Calculate new scores
                if (oldTeam && localGameState.teams[oldTeam]) {
                    updates[`teams/${oldTeam}/score`] = (localGameState.teams[oldTeam].score || 0) - points;
                }
                if (newTeam && localGameState.teams[newTeam]) {
                    updates[`teams/${newTeam}/score`] = (localGameState.teams[newTeam].score || 0) + points;
                }
                
                await database.ref(`feud-rooms/${currentRoomCode}`).update(updates);
            };
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No history yet.</td></tr>';
    }
}

function renderHostDashboard(data) {
    if (!data.questions) return;
    
    const qIdx = data.currentQuestionIdx;
    const qData = data.questions[qIdx];
    
    // Top Info
    document.getElementById('host-question-counter').textContent = `Q${qIdx + 1} of ${data.questions.length}`;
    document.getElementById('host-question-text').textContent = qData.question;
    
    document.getElementById('buzzer-master-toggle').value = data.gameState.buzzerMode;

    // Board Builder
    const board = document.getElementById('host-board');
    board.innerHTML = '';
    
    let allRevealed = true;
    qData.answers.forEach((ans, idx) => {
        const key = `${qIdx + 1}_${idx}`;
        const isRevealed = data.revealed && data.revealed[key];
        if (!isRevealed) allRevealed = false;

        const row = document.createElement('div');
        row.className = `host-row ${isRevealed ? 'revealed' : ''}`;
        
        const rank = `<div class="row-rank">${idx + 1}</div>`;
        const text = `<div class="row-text">${isRevealed ? ans.text : '??? hidden ???'}</div>`;
        const pts = `<div class="row-pts">${isRevealed ? ans.points : '--'}</div>`;
        
        let badge = '';
        if (isRevealed && isRevealed.awardedTo) {
            const tColor = data.teams[isRevealed.awardedTo].color;
            badge = `<span class="awarded-badge" style="background:${tColor}">${isRevealed.awardedTo}</span>`;
        }

        row.innerHTML = rank + text + badge + pts;
        
        if (!isRevealed) {
            row.onclick = () => {
                pendingRevealRow = idx;
                const teamSelect = document.getElementById('reveal-team-select');
                teamSelect.innerHTML = '';
                Object.keys(data.teams).forEach(t => {
                    if (data.teams[t].enabled) {
                        const opt = document.createElement('option');
                        opt.value = t;
                        opt.textContent = data.teams[t].name;
                        if (t === data.gameState.currentTeam) opt.selected = true;
                        teamSelect.appendChild(opt);
                    }
                });
                
                document.getElementById('reveal-modal-title').textContent = `Reveal Row ${idx+1} (${ans.points} pts)`;
                document.getElementById('reveal-modal').classList.add('active');
            };
        }
        board.appendChild(row);
    });

    const introBtn = document.getElementById('intro-round-btn');
    if (Object.keys(data.revealed || {}).filter(k => k.startsWith(`${qIdx+1}_`)).length === 0) {
        introBtn.classList.remove('hidden');
        if (data.displayMode === 'intro') {
            introBtn.textContent = '➡ Show Board';
            introBtn.className = 'btn btn-yellow';
        } else {
            introBtn.textContent = '🎬 Introduce Round';
            introBtn.className = 'btn btn-cyan';
        }
    } else {
        introBtn.classList.add('hidden');
    }

    // Strikes
    const strikes = data.gameState.strikes || 0;
    const strikeIcons = document.getElementById('host-strikes').querySelectorAll('.strike-icon');
    strikeIcons.forEach((el, idx) => {
        if (idx < strikes) {
            el.textContent = '❌';
            el.classList.remove('empty');
        } else {
            el.textContent = '⚪';
            el.classList.add('empty');
        }
    });

    // Steal zone
    const stealZone = document.getElementById('steal-zone');
    if (data.gameState.stealActive) {
        stealZone.classList.remove('hidden');
        document.getElementById('start-steal-btn').classList.add('hidden');
        document.getElementById('end-steal-btn').classList.remove('hidden');
        stealZone.querySelector('button').nextSibling.textContent = ` Waiting for ${data.gameState.stealingTeam} to steal...`;
    } else {
        stealZone.classList.add('hidden');
        document.getElementById('start-steal-btn').classList.remove('hidden');
        document.getElementById('end-steal-btn').classList.add('hidden');
    }

    // Teams Control
    const currentTeamSel = document.getElementById('current-team-select');
    const f1Sel = document.getElementById('faceoff-team-1');
    const f2Sel = document.getElementById('faceoff-team-2');

    if (currentTeamSel.options.length === 0) {
        Object.keys(data.teams).forEach(t => {
            if (data.teams[t].enabled) {
                const opt1 = document.createElement('option');
                opt1.value = t; opt1.textContent = data.teams[t].name;
                currentTeamSel.appendChild(opt1);
                
                const opt2 = opt1.cloneNode(true);
                const opt3 = opt1.cloneNode(true);
                f1Sel.appendChild(opt2);
                f2Sel.appendChild(opt3);
            }
        });
    }
    currentTeamSel.value = data.gameState.currentTeam;
    
    if (data.gameState.faceoffTeams) {
        f1Sel.value = data.gameState.faceoffTeams[0];
        f2Sel.value = data.gameState.faceoffTeams[1];
        document.getElementById('apply-faceoff-btn').classList.replace('btn-cyan', 'btn-green');
        document.getElementById('apply-faceoff-btn').textContent = "Active";
    } else {
        document.getElementById('apply-faceoff-btn').classList.replace('btn-green', 'btn-cyan');
        document.getElementById('apply-faceoff-btn').textContent = "Apply";
    }

    // Roster & Buzzes
    const roster = document.getElementById('host-roster');
    roster.innerHTML = '';
    Object.keys(data.teams).filter(t => data.teams[t].enabled).forEach(t => {
        const teamDiv = document.createElement('div');
        teamDiv.className = 'roster-team';
        teamDiv.style.borderLeftColor = data.teams[t].color;
        
        teamDiv.innerHTML = `<h4 style="color:${data.teams[t].color}">${data.teams[t].name}</h4>`;
        
        if (data.players) {
            Object.keys(data.players).forEach(pId => {
                const p = data.players[pId];
                if (p.team === t) {
                    const pRow = document.createElement('div');
                    pRow.className = 'roster-player';
                    
                    let buzzStatus = '';
                    if (data.buzzes && data.buzzes[pId]) {
                        // Very rough time calc, host UI just shows they buzzed
                        buzzStatus = `<span class="buzz-time-badge">BUZZED</span>`;
                    }
                    
                    pRow.innerHTML = `
                        <span>${p.name} ${buzzStatus}</span>
                        ${data.gameState.buzzerMode === 'selected' ? 
                          `<input type="checkbox" class="buzz-checkbox" data-pid="${pId}" ${p.buzzEligible ? 'checked':''}>` : ''}
                    `;
                    teamDiv.appendChild(pRow);
                }
            });
        }
        roster.appendChild(teamDiv);
    });

    // Buzz Order
    const buzzOrderList = document.getElementById('host-buzz-order');
    buzzOrderList.innerHTML = '';
    if (data.buzzes) {
        const buzzArr = Object.keys(data.buzzes).map(k => ({
            id: k,
            ts: data.buzzes[k].timestamp
        })).sort((a,b) => a.ts - b.ts);
        
        buzzArr.forEach((b, idx) => {
            const p = data.players[b.id];
            const t = data.teams[p.team];
            let delta = idx === 0 ? '' : `(+${((b.ts - buzzArr[0].ts)/1000).toFixed(2)}s)`;
            
            const entry = document.createElement('div');
            entry.className = 'buzz-entry';
            entry.style.borderLeftColor = t.color;
            entry.innerHTML = `
                <span><b>#${idx+1}</b> ${p.name} (${t.name})</span>
                <span style="color:var(--text-secondary)">${delta}</span>
            `;
            buzzOrderList.appendChild(entry);
        });
    } else {
        buzzOrderList.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 1rem;">Waiting for buzzes...</div>`;
    }

    // Handle buzz checkbox toggles
    document.querySelectorAll('.buzz-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const pId = e.target.dataset.pid;
            database.ref(`feud-rooms/${currentRoomCode}/players/${pId}`).update({
                buzzEligible: e.target.checked
            });
        };
    });

    // Live Scores Bottom
    const scoresFooter = document.getElementById('host-live-scores');
    scoresFooter.innerHTML = '';
    const sortedTeams = Object.keys(data.teams)
        .filter(t => data.teams[t].enabled)
        .sort((a,b) => (data.teams[b].score || 0) - (data.teams[a].score || 0));
        
    sortedTeams.forEach(t => {
        const sbox = document.createElement('div');
        sbox.className = 'host-score-box';
        sbox.style.borderColor = data.teams[t].color;
        if (t === data.gameState.currentTeam) {
            sbox.style.boxShadow = `0 0 15px ${data.teams[t].color}`;
        }
        sbox.innerHTML = `
            <div class="host-score-name">${data.teams[t].name}</div>
            <div class="host-score-val" style="color:${data.teams[t].color}">${data.teams[t].score || 0}</div>
        `;
        scoresFooter.appendChild(sbox);
    });
}

// ==========================================
// DISPLAY LOGIC
// ==========================================
let lastRevealedState = {};
let lastStrikeCount = 0;
let lastDisplayMode = '';

function initDisplayView() {
    if (!currentRoomCode) {
        document.body.innerHTML = "<h1 style='color:red'>Room code missing in URL</h1>";
        return;
    }
    
    // Attempt fullscreen on click anywhere
    document.body.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.warn(e));
        }
    });

    const roomRef = database.ref(`feud-rooms/${currentRoomCode}`);
    
    roomRef.on('value', (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        renderDisplay(data);
    });

    document.getElementById('display-volume').onclick = (e) => {
        isMuted = !isMuted;
        e.target.classList.toggle('muted', isMuted);
    };
}

function renderDisplay(data) {
    if (!data.questions) return;
    const qIdx = data.currentQuestionIdx;
    const qData = data.questions[qIdx];
    const mode = data.displayMode;

    // Hide all modes
    document.querySelectorAll('.display-mode').forEach(m => m.classList.add('hidden'));

    if (mode === 'intro') {
        const intro = document.getElementById('display-mode-intro');
        intro.classList.remove('hidden');
        document.getElementById('intro-q-number').textContent = `QUESTION ${qIdx + 1}`;
        document.getElementById('intro-q-text').textContent = qData.question;
        
        if (mode !== lastDisplayMode) {
             // Retrigger animations
             document.getElementById('intro-q-number').classList.remove('slide-in');
             void document.getElementById('intro-q-number').offsetWidth;
             document.getElementById('intro-q-number').classList.add('slide-in');
        }
    } 
    else if (mode === 'filler') {
        const fillerMode = document.getElementById('display-mode-filler');
        fillerMode.classList.remove('hidden');
    }
    else if (mode === 'board') {
        const boardMode = document.getElementById('display-mode-board');
        boardMode.classList.remove('hidden');
        
        document.getElementById('display-question').textContent = qData.question;
        
        renderDisplayBoard(data, qData, qIdx);
        renderDisplayScores(data);
        handleStrikes(data);
    }
    else if (mode === 'steal') {
        const stealMode = document.getElementById('display-mode-steal');
        stealMode.classList.remove('hidden');
        
        const stealingTeam = data.gameState.stealingTeam;
        if (stealingTeam && data.teams[stealingTeam]) {
             const tData = data.teams[stealingTeam];
             const el = document.getElementById('steal-team-name');
             el.textContent = tData.name;
             el.style.color = tData.color;
        }
        
        if (mode !== lastDisplayMode) {
            playSteal();
        }
    }
    else if (mode === 'highlights') {
        const hMode = document.getElementById('display-mode-highlights');
        hMode.classList.remove('hidden');
        // Implement podium logic here if needed
    }

    lastDisplayMode = mode;

    // Buzz Overlay
    const overlay = document.getElementById('display-buzz-overlay');
    if (data.buzzes) {
        const buzzArr = Object.keys(data.buzzes).map(k => ({
            id: k,
            ts: data.buzzes[k].timestamp
        })).sort((a,b) => a.ts - b.ts);

        const firstBuzz = buzzArr[0];
        
        if (firstBuzz && (!lastRevealedState.firstBuzz || lastRevealedState.firstBuzz.ts !== firstBuzz.ts)) {
            const p = data.players[firstBuzz.id];
            const t = data.teams[p.team];
            
            const overlayText = document.getElementById('buzz-overlay-text');
            overlayText.innerHTML = `🥇 FIRST BUZZ <br><br> <span style="color:${t.color}">${p.name} (${t.name})</span>`;
            overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
            overlay.style.boxShadow = `inset 0 0 150px ${t.color}`;
            overlay.classList.remove('hidden');
            
            playDing();
            
            // Auto switch current team to the buzzer
            if (currentRole === 'host') {
                database.ref(`feud-rooms/${currentRoomCode}`).update({ 'gameState/currentTeam': p.team });
            }

            // Hide after 3 seconds
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 3000);
            
            lastRevealedState.firstBuzz = firstBuzz;
        }
    } else {
        overlay.classList.add('hidden');
        lastRevealedState.firstBuzz = null;
    }
}

function renderDisplayBoard(data, qData, qIdx) {
    const container = document.getElementById('display-board-container');
    const numAnswers = qData.answers.length;
    
    // Set grid columns based on answer count
    let cols = 1;
    if (numAnswers === 5 || numAnswers === 6 || numAnswers === 7 || numAnswers === 8) {
        cols = 2;
    }
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    
    // Only rebuild DOM if answer count changes or question changes
    // For simplicity, we just rebuild and maintain flip state
    container.innerHTML = '';
    
    qData.answers.forEach((ans, idx) => {
        const key = `${qIdx + 1}_${idx}`;
        const isRevealed = data.revealed && data.revealed[key];
        
        // Check for new reveal to play sound
        if (isRevealed && !lastRevealedState[key]) {
            if (idx === 0) {
                playRevealTop();
                triggerConfetti();
            } else {
                playDing();
            }
        }

        const row = document.createElement('div');
        row.className = `display-row ${isRevealed ? 'revealed' : ''}`;
        
        let teamBadge = '';
        if (isRevealed && isRevealed.awardedTo) {
            const tColor = data.teams[isRevealed.awardedTo].color;
            teamBadge = `<div class="d-team-badge" style="background:${tColor}"></div>`;
        }

        row.innerHTML = `
            ${teamBadge}
            <div class="display-row-inner">
                <div class="row-front">${idx + 1}</div>
                <div class="row-back">
                    <div class="d-rank">${idx + 1}</div>
                    <div class="d-text">${ans.text}</div>
                    <div class="d-pts">${ans.points}</div>
                </div>
            </div>
        `;
        container.appendChild(row);
    });
    
    lastRevealedState = Object.assign({}, data.revealed);
}

function renderDisplayScores(data) {
    const sidebar = document.getElementById('display-sidebar');
    sidebar.innerHTML = '';
    sidebar.className = 'faceoff-score-bar'; // Override sidebar styles to bottom bar
    
    // Filter by faceoff if active
    let displayTeams = Object.keys(data.teams).filter(t => data.teams[t].enabled);
    if (data.gameState.faceoffTeams) {
        displayTeams = data.gameState.faceoffTeams;
    } else {
        displayTeams = displayTeams.sort((a,b) => (data.teams[b].score || 0) - (data.teams[a].score || 0));
    }
        
    displayTeams.forEach((t, idx) => {
        if (!data.teams[t]) return;
        const isControl = t === data.gameState.currentTeam;
        const card = document.createElement('div');
        card.className = `side-score-card ${isControl ? 'in-control' : ''}`;
        
        card.innerHTML = `
            <div class="side-color-band" style="background:${data.teams[t].color}"></div>
            <div class="side-info">
                <div class="side-name">${data.teams[t].name}</div>
                <div class="side-val">${data.teams[t].score || 0}</div>
            </div>
        `;
        sidebar.appendChild(card);
        
        // Add VS divider in face-off mode
        if (data.gameState.faceoffTeams && idx === 0) {
            const vs = document.createElement('div');
            vs.className = 'vs-divider';
            vs.textContent = 'VS';
            sidebar.appendChild(vs);
        }
    });
}

function handleStrikes(data) {
    const strikes = data.gameState.strikes || 0;
    const overlay = document.getElementById('display-strikes-overlay');
    
    if (strikes > lastStrikeCount && strikes > 0) {
        // Play strike animation & sound
        playStrike();
        document.body.classList.add('screen-shake');
        setTimeout(() => document.body.classList.remove('screen-shake'), 500);
        
        overlay.classList.remove('hidden');
        overlay.innerHTML = '';
        for(let i=0; i<strikes; i++) {
            const xs = document.createElement('div');
            xs.className = 'big-strike';
            xs.textContent = '❌';
            overlay.appendChild(xs);
        }
        
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 1500);
    }
    
    lastStrikeCount = strikes;
}

function triggerConfetti() {
    confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: [TEAM_COLORS.C.hex, TEAM_COLORS.A.hex, '#FFFFFF']
    });
}


// ==========================================
// PLAYER LOGIC
// ==========================================

function initPlayerView() {
    if (!currentRoomCode) {
        document.body.innerHTML = "<h1 style='color:red'>Room code missing</h1>";
        return;
    }
    playerId = localStorage.getItem(`feud_player_${currentRoomCode}`);
    if (!playerId) {
        alert("Session lost. Please rejoin.");
        window.location.href = '?view=landing';
        return;
    }

    const roomRef = database.ref(`feud-rooms/${currentRoomCode}`);
    
    roomRef.on('value', (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        renderPlayer(data);
    });

    // Buzzer action
    const btn = document.getElementById('buzzer-button');
    // Handle both touchstart for mobile responsiveness and mousedown for testing
    const handleBuzz = (e) => {
        e.preventDefault();
        if (btn.classList.contains('armed')) {
            if (navigator.vibrate) navigator.vibrate(150);
            
            // Register buzz in Firebase
            const updates = {};
            updates[`buzzes/${playerId}`] = {
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            roomRef.update(updates);
        }
    };
    
    btn.addEventListener('touchstart', handleBuzz, {passive: false});
    btn.addEventListener('mousedown', handleBuzz);
}

function renderPlayer(data) {
    if (!data.players || !data.players[playerId]) return;
    const pData = data.players[playerId];
    const tData = data.teams[pData.team];
    
    const passiveView = document.getElementById('player-passive');
    const buzzerView = document.getElementById('player-buzzer-screen');
    
    // Check Buzzer Mode
    let showBuzzer = false;
    if (data.gameState.buzzerMode === 'all') showBuzzer = true;
    if (data.gameState.buzzerMode === 'selected' && pData.buzzEligible) showBuzzer = true;
    
    // Face-off restriction
    if (showBuzzer && data.gameState.faceoffTeams) {
        if (!data.gameState.faceoffTeams.includes(pData.team)) {
            showBuzzer = false;
        }
    }

    if (!showBuzzer) {
        // Passive Mode
        buzzerView.classList.add('hidden');
        passiveView.classList.remove('hidden');
        
        document.getElementById('passive-team-name').textContent = tData.name;
        document.getElementById('passive-team-name').style.color = tData.color;
        document.getElementById('passive-score-display').textContent = tData.score || 0;
        document.getElementById('passive-score-display').style.color = tData.color;
        
        const miniScores = document.getElementById('mini-scoreboard');
        miniScores.innerHTML = '';
        Object.keys(data.teams).filter(t => data.teams[t].enabled).forEach(t => {
            if (t !== pData.team) {
                const pill = document.createElement('div');
                pill.className = 'mini-score-pill';
                pill.style.borderLeftColor = data.teams[t].color;
                pill.innerHTML = `<span>${data.teams[t].name}:</span> <strong style="color:${data.teams[t].color}">${data.teams[t].score || 0}</strong>`;
                miniScores.appendChild(pill);
            }
        });
        
    } else {
        // Buzzer Mode
        passiveView.classList.add('hidden');
        buzzerView.classList.remove('hidden');
        
        document.getElementById('player-info-display').innerHTML = `You are <b>${pData.name}</b> on <b style="color:${tData.color}">${tData.name}</b>`;
        
        const btn = document.getElementById('buzzer-button');
        const label = document.getElementById('buzzer-label');
        const rankLbl = document.getElementById('buzzer-rank');
        
        // Reset classes
        btn.className = '';
        btn.style.borderColor = tData.color;
        btn.style.backgroundColor = 'transparent';
        
        const hasBuzzed = data.buzzes && data.buzzes[playerId];
        
        if (hasBuzzed) {
            btn.classList.add('buzzed');
            label.textContent = "BUZZED!";
            btn.style.backgroundColor = tData.color;
            btn.style.color = '#000';
            
            // Calculate rank
            const allBuzzes = Object.keys(data.buzzes).map(k => ({id: k, ts: data.buzzes[k].timestamp}));
            allBuzzes.sort((a,b) => a.ts - b.ts);
            const r = allBuzzes.findIndex(b => b.id === playerId) + 1;
            rankLbl.textContent = `#${r}`;
        } else {
            btn.classList.add('armed');
            label.textContent = "TAP TO BUZZ";
            rankLbl.textContent = "";
            btn.style.backgroundColor = 'transparent';
            btn.style.color = 'white';
        }
    }
}

// Init Router on load
document.addEventListener('DOMContentLoaded', initRouter);
