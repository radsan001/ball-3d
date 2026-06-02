// ===== ROLL RUSH - Epic Ball Runner Game Engine =====
// Copyright-free, original implementation

(function () {
    'use strict';

    // ===== Canvas & Context =====
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // ===== Game State =====
    const STATE = {
        MENU: 0,
        PLAYING: 1,
        GAMEOVER: 2,
        LEVEL_COMPLETE: 3
    };

    let gameState = STATE.MENU;
    let score = 0;
    let coins = 0;
    let level = 1;
    let bestScore = parseInt(localStorage.getItem('rollrush_best') || '0');
    let totalCoins = parseInt(localStorage.getItem('rollrush_coins') || '0');

    // ===== Ball Skins =====
    const SKINS = [
        { name: 'Fire', colors: ['#ff6b6b', '#ee5a24', '#c0392b'], highlight: '#ff9ff3' },
        { name: 'Ocean', colors: ['#48dbfb', '#0abde3', '#0652DD'], highlight: '#dff9fb' },
        { name: 'Toxic', colors: ['#55efc4', '#00b894', '#00cec9'], highlight: '#dfe6e9' },
        { name: 'Gold', colors: ['#fdcb6e', '#f39c12', '#e17055'], highlight: '#ffeaa7' },
        { name: 'Galaxy', colors: ['#a29bfe', '#6c5ce7', '#5f27cd'], highlight: '#dfe6e9' },
        { name: 'Neon', colors: ['#fd79a8', '#e84393', '#d63031'], highlight: '#fab1a0' },
        { name: 'Ice', colors: ['#74b9ff', '#0984e3', '#2d3436'], highlight: '#dfe6e9' },
        { name: 'Lava', colors: ['#ff7675', '#d63031', '#2d3436'], highlight: '#fab1a0' }
    ];
    let currentSkin = 0;

    // ===== Camera & Perspective =====
    const camera = {
        x: 0,
        y: 0,
        z: 0,
        pitch: 0.55,    // look-down angle
        fov: 500
    };

    // ===== Ball (Player) =====
    const ball = {
        x: 0,
        y: 0,
        z: 0,
        radius: 0.4,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 0.18,
        rotationX: 0,
        rotationZ: 0,
        grounded: false,
        alive: true,
        trail: []
    };

    // ===== Track =====
    const TRACK_WIDTH = 4;
    const TRACK_SEGMENT_LEN = 2;
    let trackSegments = [];
    let obstacles = [];
    let coinItems = [];
    let decorations = [];
    let levelLength = 150;
    let trackGenerated = false;

    // ===== Input =====
    let inputX = 0;
    let touchStartX = 0;
    let touchCurrentX = 0;
    let isTouching = false;
    let keysDown = {};

    // ===== Particles =====
    let particles = [];

    // ===== Colors / Theme =====
    const themes = [
        { sky1: '#0f0a1e', sky2: '#2d1b69', track: '#2a2055', trackEdge: '#7c3aed', accent: '#a78bfa', fog: '#1a1035' },
        { sky1: '#0a1628', sky2: '#1a3a5c', track: '#1a2d4a', trackEdge: '#2563eb', accent: '#60a5fa', fog: '#0f1e36' },
        { sky1: '#0a1e14', sky2: '#1b4a32', track: '#1a3d2a', trackEdge: '#059669', accent: '#34d399', fog: '#0f2e1e' },
        { sky1: '#1e0a0a', sky2: '#5c1a1a', track: '#3d1a1a', trackEdge: '#dc2626', accent: '#f87171', fog: '#2e0f0f' },
        { sky1: '#1e1a0a', sky2: '#5c4a1a', track: '#3d331a', trackEdge: '#d97706', accent: '#fbbf24', fog: '#2e250f' }
    ];
    let currentTheme = themes[0];

    // ===== Audio (Web Audio API - Procedural) =====
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playTone(freq, duration, type = 'square', volume = 0.1) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function playCoinSound() {
        playTone(880, 0.1, 'sine', 0.15);
        setTimeout(() => playTone(1320, 0.1, 'sine', 0.12), 50);
    }

    function playDeathSound() {
        playTone(200, 0.3, 'sawtooth', 0.15);
        setTimeout(() => playTone(100, 0.4, 'sawtooth', 0.1), 100);
    }

    function playLevelComplete() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((n, i) => setTimeout(() => playTone(n, 0.2, 'sine', 0.12), i * 120));
    }

    // ===== Resize =====
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // ===== 3D Projection =====
    function project(x, y, z) {
        // Translate relative to camera
        let dx = x - camera.x;
        let dy = y - camera.y;
        let dz = z - camera.z;

        // Rotate by pitch
        const cos = Math.cos(camera.pitch);
        const sin = Math.sin(camera.pitch);
        const rz = dz * cos - dy * sin;
        const ry = dz * sin + dy * cos;

        if (rz < 0.5) return null; // behind camera

        const scale = camera.fov / rz;
        const sx = canvas.width / 2 + dx * scale;
        const sy = canvas.height / 2 - ry * scale;

        return { x: sx, y: sy, scale: scale, depth: rz };
    }

    // ===== Track Generation =====
    function generateLevel() {
        trackSegments = [];
        obstacles = [];
        coinItems = [];
        decorations = [];

        levelLength = 120 + level * 30;
        currentTheme = themes[(level - 1) % themes.length];

        // Generate track segments
        for (let i = 0; i < levelLength; i++) {
            const seg = {
                z: i * TRACK_SEGMENT_LEN,
                width: TRACK_WIDTH,
                hasTrack: true,
                isCheckpoint: (i % 30 === 0 && i > 0),
                elevation: 0
            };

            // Create gaps (more frequent in higher levels)
            if (i > 10 && i < levelLength - 10) {
                const gapChance = 0.04 + level * 0.008;
                if (Math.random() < gapChance && i % 3 === 0) {
                    seg.hasTrack = false;
                }
                // Narrow sections
                if (Math.random() < 0.03 + level * 0.005) {
                    seg.width = 2 + Math.random();
                }
            }

            trackSegments.push(seg);
        }

        // Make sure gaps don't appear consecutively more than 2
        for (let i = 2; i < trackSegments.length; i++) {
            if (!trackSegments[i].hasTrack && !trackSegments[i - 1].hasTrack && !trackSegments[i - 2].hasTrack) {
                trackSegments[i].hasTrack = true;
            }
        }

        // Generate obstacles
        for (let i = 15; i < levelLength - 5; i += 3) {
            if (Math.random() < 0.35 + level * 0.03) {
                const type = Math.random();
                let obs;

                if (type < 0.35) {
                    // Sliding barrier (left-right)
                    obs = {
                        type: 'slider',
                        z: i * TRACK_SEGMENT_LEN,
                        x: 0,
                        width: 1.2 + Math.random() * 0.8,
                        height: 1.2,
                        speed: 0.02 + Math.random() * 0.02 + level * 0.003,
                        phase: Math.random() * Math.PI * 2,
                        color: '#ef4444'
                    };
                } else if (type < 0.6) {
                    // Rotating hammer
                    obs = {
                        type: 'hammer',
                        z: i * TRACK_SEGMENT_LEN,
                        x: 0,
                        armLength: 1.5 + Math.random(),
                        speed: 0.03 + Math.random() * 0.02 + level * 0.002,
                        phase: Math.random() * Math.PI * 2,
                        color: '#f59e0b'
                    };
                } else if (type < 0.8) {
                    // Wall with gap
                    const gapSide = Math.random() < 0.5 ? -1 : 1;
                    obs = {
                        type: 'wall',
                        z: i * TRACK_SEGMENT_LEN,
                        gapX: gapSide * (0.5 + Math.random() * 0.8),
                        gapWidth: 1.4 - level * 0.02,
                        height: 1.5,
                        color: '#8b5cf6'
                    };
                    if (obs.gapWidth < 0.9) obs.gapWidth = 0.9;
                } else {
                    // Pillars
                    obs = {
                        type: 'pillar',
                        z: i * TRACK_SEGMENT_LEN,
                        x: (Math.random() - 0.5) * (TRACK_WIDTH - 1),
                        radius: 0.3 + Math.random() * 0.3,
                        height: 1.5,
                        color: '#ec4899'
                    };
                }
                obstacles.push(obs);
            }
        }

        // Generate coins
        for (let i = 8; i < levelLength - 3; i += 2) {
            if (Math.random() < 0.3) {
                const coinX = (Math.random() - 0.5) * (TRACK_WIDTH - 1);
                coinItems.push({
                    x: coinX,
                    y: 0.6,
                    z: i * TRACK_SEGMENT_LEN,
                    collected: false,
                    rotation: Math.random() * Math.PI * 2
                });
            }
        }

        // Generate decorations (floating crystals on sides)
        for (let i = 0; i < levelLength; i += 5) {
            if (Math.random() < 0.6) {
                const side = Math.random() < 0.5 ? -1 : 1;
                decorations.push({
                    x: side * (TRACK_WIDTH / 2 + 1.5 + Math.random() * 3),
                    y: Math.random() * 3 + 1,
                    z: i * TRACK_SEGMENT_LEN + Math.random() * 6,
                    size: 0.3 + Math.random() * 0.5,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }

        trackGenerated = true;
    }

    // ===== Reset Ball =====
    function resetBall() {
        ball.x = 0;
        ball.y = 0.5;
        ball.z = 5;
        ball.vx = 0;
        ball.vy = 0;
        ball.vz = 0;
        ball.grounded = false;
        ball.alive = true;
        ball.trail = [];
        ball.rotationX = 0;
        ball.rotationZ = 0;
    }

    // ===== Start Game =====
    function startGame() {
        initAudio();
        score = 0;
        coins = 0;
        level = 1;
        generateLevel();
        resetBall();
        gameState = STATE.PLAYING;
        updateHUD();
        document.getElementById('startScreen').classList.add('hidden');
        document.getElementById('gameHUD').classList.remove('hidden');
        document.getElementById('gameOverScreen').classList.add('hidden');
        document.getElementById('levelCompleteScreen').classList.add('hidden');
    }

    function nextLevel() {
        level++;
        score += 500; // level bonus
        generateLevel();
        resetBall();
        gameState = STATE.PLAYING;
        updateHUD();
        document.getElementById('levelCompleteScreen').classList.add('hidden');
        document.getElementById('gameHUD').classList.remove('hidden');
    }

    function gameOver() {
        gameState = STATE.GAMEOVER;
        ball.alive = false;
        playDeathSound();

        // Spawn death particles
        for (let i = 0; i < 30; i++) {
            const skin = SKINS[currentSkin];
            particles.push({
                x: ball.x,
                y: ball.y,
                z: ball.z,
                vx: (Math.random() - 0.5) * 0.3,
                vy: Math.random() * 0.3 + 0.1,
                vz: (Math.random() - 0.5) * 0.2,
                life: 1,
                decay: 0.015 + Math.random() * 0.01,
                color: skin.colors[Math.floor(Math.random() * skin.colors.length)],
                size: 0.1 + Math.random() * 0.15
            });
        }

        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('rollrush_best', bestScore.toString());
        }
        totalCoins += coins;
        localStorage.setItem('rollrush_coins', totalCoins.toString());

        setTimeout(() => {
            document.getElementById('gameHUD').classList.add('hidden');
            document.getElementById('finalScore').textContent = score;
            document.getElementById('finalLevel').textContent = level;
            document.getElementById('finalCoins').textContent = coins;
            document.getElementById('bestScoreGameover').textContent = bestScore;
            document.getElementById('gameOverScreen').classList.remove('hidden');
        }, 800);
    }

    function levelComplete() {
        gameState = STATE.LEVEL_COMPLETE;
        playLevelComplete();

        // Firework particles
        for (let i = 0; i < 50; i++) {
            const angle = (i / 50) * Math.PI * 2;
            particles.push({
                x: ball.x,
                y: ball.y + 1,
                z: ball.z,
                vx: Math.cos(angle) * 0.2 * Math.random(),
                vy: Math.sin(angle) * 0.3 * Math.random() + 0.1,
                vz: (Math.random() - 0.5) * 0.1,
                life: 1,
                decay: 0.01 + Math.random() * 0.01,
                color: ['#fbbf24', '#a78bfa', '#34d399', '#f87171', '#60a5fa'][Math.floor(Math.random() * 5)],
                size: 0.08 + Math.random() * 0.12
            });
        }

        setTimeout(() => {
            document.getElementById('gameHUD').classList.add('hidden');
            document.getElementById('completedLevel').textContent = level;
            document.getElementById('levelCompleteScreen').classList.remove('hidden');
        }, 600);
    }

    // ===== HUD Update =====
    function updateHUD() {
        document.getElementById('scoreDisplay').textContent = score;
        document.getElementById('levelDisplay').textContent = level;
        document.getElementById('coinDisplay').textContent = coins;

        const progress = Math.min(100, (ball.z / (levelLength * TRACK_SEGMENT_LEN)) * 100);
        document.getElementById('progressBar').style.width = progress + '%';
    }

    // ===== Input Handling =====
    // Keyboard
    window.addEventListener('keydown', (e) => {
        keysDown[e.key] = true;
        if (e.key === ' ' && gameState === STATE.MENU) startGame();
    });
    window.addEventListener('keyup', (e) => { keysDown[e.key] = false; });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isTouching = true;
        touchStartX = e.touches[0].clientX;
        touchCurrentX = touchStartX;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isTouching) {
            touchCurrentX = e.touches[0].clientX;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        isTouching = false;
        inputX = 0;
    }, { passive: false });

    // Mouse (for desktop testing)
    let mouseDown = false;
    let mouseStartX = 0;
    canvas.addEventListener('mousedown', (e) => {
        mouseDown = true;
        mouseStartX = e.clientX;
    });
    canvas.addEventListener('mousemove', (e) => {
        if (mouseDown) {
            const dx = e.clientX - mouseStartX;
            inputX = Math.max(-1, Math.min(1, dx / 80));
        }
    });
    canvas.addEventListener('mouseup', () => {
        mouseDown = false;
        inputX = 0;
    });

    // ===== Buttons =====
    document.getElementById('playBtn').addEventListener('click', startGame);
    document.getElementById('retryBtn').addEventListener('click', startGame);
    document.getElementById('nextLevelBtn').addEventListener('click', nextLevel);

    // ===== Skin Selector =====
    function buildSkinSelector() {
        const container = document.getElementById('skinSelector');
        container.innerHTML = '';
        SKINS.forEach((skin, i) => {
            const el = document.createElement('div');
            el.className = 'skin-option' + (i === currentSkin ? ' active' : '');
            el.style.background = `radial-gradient(circle at 35% 35%, ${skin.colors[0]}, ${skin.colors[1]}, ${skin.colors[2]})`;
            el.addEventListener('click', () => {
                currentSkin = i;
                buildSkinSelector();
            });
            container.appendChild(el);
        });
    }
    buildSkinSelector();

    // ===== Best Score Display =====
    document.getElementById('bestScoreValue').textContent = bestScore;

    // ===== Physics & Update =====
    let lastTime = 0;
    let time = 0;

    function update(dt) {
        if (gameState !== STATE.PLAYING) return;
        if (!ball.alive) return;

        time += dt;

        // Input
        let moveX = 0;
        if (keysDown['ArrowLeft'] || keysDown['a']) moveX = -1;
        if (keysDown['ArrowRight'] || keysDown['d']) moveX = 1;

        if (isTouching) {
            const dx = touchCurrentX - touchStartX;
            moveX = Math.max(-1, Math.min(1, dx / 50));
        }

        if (mouseDown) {
            moveX = inputX;
        }

        // Ball movement
        const moveSpeed = 0.08 + level * 0.003;
        ball.vx += moveX * moveSpeed * dt * 60;
        ball.vx *= 0.88; // friction

        // Forward auto-move
        ball.vz += ball.speed * dt * 60;
        ball.vz *= 0.95;

        // Gravity
        ball.vy -= 0.015 * dt * 60;

        // Apply velocity
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.z += ball.vz;

        // Rotation visual
        ball.rotationX += ball.vz * 3;
        ball.rotationZ -= ball.vx * 3;

        // Track collision
        const segIndex = Math.floor(ball.z / TRACK_SEGMENT_LEN);
        ball.grounded = false;

        if (segIndex >= 0 && segIndex < trackSegments.length) {
            const seg = trackSegments[segIndex];
            const halfW = seg.width / 2;

            if (seg.hasTrack && Math.abs(ball.x) < halfW) {
                // On track
                if (ball.y <= ball.radius + seg.elevation) {
                    ball.y = ball.radius + seg.elevation;
                    ball.vy = 0;
                    ball.grounded = true;
                }
            }
        }

        // Fall death
        if (ball.y < -8) {
            gameOver();
            return;
        }

        // Track boundary push-back
        if (ball.grounded) {
            const seg = trackSegments[segIndex];
            if (seg) {
                const halfW = seg.width / 2;
                if (ball.x < -halfW + ball.radius) {
                    ball.x = -halfW + ball.radius;
                    ball.vx = 0;
                }
                if (ball.x > halfW - ball.radius) {
                    ball.x = halfW - ball.radius;
                    ball.vx = 0;
                }
            }
        }

        // Obstacle collision
        for (const obs of obstacles) {
            const dz = ball.z - obs.z;
            if (Math.abs(dz) > 3) continue;

            if (obs.type === 'slider') {
                const obsX = Math.sin(time * obs.speed * 60 + obs.phase) * (TRACK_WIDTH / 2 - obs.width / 2);
                if (Math.abs(dz) < 0.6 && Math.abs(ball.x - obsX) < (obs.width / 2 + ball.radius) && ball.y < obs.height) {
                    gameOver();
                    return;
                }
            } else if (obs.type === 'hammer') {
                const angle = time * obs.speed * 60 + obs.phase;
                const hammerX = Math.sin(angle) * obs.armLength;
                const hammerZ = obs.z + Math.cos(angle) * 0.3;
                const dist = Math.sqrt((ball.x - hammerX) ** 2 + (ball.z - hammerZ) ** 2);
                if (dist < ball.radius + 0.4 && ball.y < 1.2) {
                    gameOver();
                    return;
                }
            } else if (obs.type === 'wall') {
                if (Math.abs(dz) < 0.4 && ball.y < obs.height) {
                    const inGap = Math.abs(ball.x - obs.gapX) < (obs.gapWidth / 2);
                    if (!inGap) {
                        gameOver();
                        return;
                    }
                }
            } else if (obs.type === 'pillar') {
                const dist = Math.sqrt((ball.x - obs.x) ** 2 + dz ** 2);
                if (dist < ball.radius + obs.radius && ball.y < obs.height) {
                    gameOver();
                    return;
                }
            }
        }

        // Coin collection
        for (const coin of coinItems) {
            if (coin.collected) continue;
            const dist = Math.sqrt((ball.x - coin.x) ** 2 + (ball.y - coin.y) ** 2 + (ball.z - coin.z) ** 2);
            if (dist < ball.radius + 0.4) {
                coin.collected = true;
                coins++;
                score += 10;
                playCoinSound();

                // Coin particles
                for (let i = 0; i < 8; i++) {
                    particles.push({
                        x: coin.x, y: coin.y, z: coin.z,
                        vx: (Math.random() - 0.5) * 0.15,
                        vy: Math.random() * 0.2,
                        vz: (Math.random() - 0.5) * 0.1,
                        life: 1, decay: 0.03,
                        color: '#fbbf24',
                        size: 0.08
                    });
                }
            }
        }

        // Score based on distance
        score = Math.max(score, Math.floor(ball.z * 2) + coins * 10);

        // Level complete
        if (ball.z >= (levelLength - 5) * TRACK_SEGMENT_LEN) {
            levelComplete();
            return;
        }

        // Trail
        if (ball.grounded && Math.random() < 0.5) {
            ball.trail.push({
                x: ball.x, y: 0.01, z: ball.z,
                life: 1
            });
        }
        ball.trail = ball.trail.filter(t => {
            t.life -= 0.02;
            return t.life > 0;
        });

        // Update particles
        particles = particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;
            p.vy -= 0.005;
            p.life -= p.decay;
            return p.life > 0;
        });

        // Camera follow
        camera.x += (ball.x * 0.3 - camera.x) * 0.08;
        camera.y = ball.y + 4;
        camera.z = ball.z - 5;

        updateHUD();
    }

    // ===== Rendering =====
    function drawTrackSegment(seg, nextSeg, index) {
        const z1 = seg.z;
        const z2 = z1 + TRACK_SEGMENT_LEN;
        const w1 = seg.width / 2;
        const w2 = nextSeg ? nextSeg.width / 2 : w1;

        if (!seg.hasTrack) return;

        // Four corners
        const tl = project(-w1, 0, z1);
        const tr = project(w1, 0, z1);
        const bl = project(-w2, 0, z2);
        const br = project(w2, 0, z2);

        if (!tl || !tr || !bl || !br) return;
        if (tl.depth > 80) return;

        // Track surface
        const brightness = seg.isCheckpoint ? 0.6 : 0.3 + Math.sin(index * 0.1) * 0.05;
        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(bl.x, bl.y);
        ctx.closePath();

        if (seg.isCheckpoint) {
            ctx.fillStyle = currentTheme.trackEdge;
            ctx.globalAlpha = 0.6;
        } else {
            // Alternating track colors
            const isEven = index % 2 === 0;
            ctx.fillStyle = isEven ? currentTheme.track : shadeColor(currentTheme.track, 15);
            ctx.globalAlpha = 0.9;
        }
        ctx.fill();
        ctx.globalAlpha = 1;

        // Side walls (low railings)
        const wallH = 0.15;
        const tlw = project(-w1, wallH, z1);
        const trw = project(w1, wallH, z1);
        const blw = project(-w2, wallH, z2);
        const brw = project(w2, wallH, z2);

        if (tlw && blw) {
            ctx.beginPath();
            ctx.moveTo(tl.x, tl.y);
            ctx.lineTo(tlw.x, tlw.y);
            ctx.lineTo(blw.x, blw.y);
            ctx.lineTo(bl.x, bl.y);
            ctx.closePath();
            ctx.fillStyle = currentTheme.trackEdge;
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        if (trw && brw) {
            ctx.beginPath();
            ctx.moveTo(tr.x, tr.y);
            ctx.lineTo(trw.x, trw.y);
            ctx.lineTo(brw.x, brw.y);
            ctx.lineTo(br.x, br.y);
            ctx.closePath();
            ctx.fillStyle = currentTheme.trackEdge;
            ctx.globalAlpha = 0.4;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Track edge lines
        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(bl.x, bl.y);
        ctx.strokeStyle = currentTheme.trackEdge;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.moveTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y);
        ctx.strokeStyle = currentTheme.trackEdge;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawBall() {
        const skin = SKINS[currentSkin];
        const p = project(ball.x, ball.y, ball.z);
        if (!p) return;

        const r = ball.radius * p.scale;

        // Ball shadow
        const shadowP = project(ball.x, 0.01, ball.z);
        if (shadowP && ball.grounded) {
            ctx.beginPath();
            ctx.ellipse(shadowP.x, shadowP.y, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fill();
        }

        // Ball body - gradient sphere
        const grad = ctx.createRadialGradient(
            p.x - r * 0.3, p.y - r * 0.3, r * 0.05,
            p.x, p.y, r
        );
        grad.addColorStop(0, skin.highlight);
        grad.addColorStop(0.3, skin.colors[0]);
        grad.addColorStop(0.7, skin.colors[1]);
        grad.addColorStop(1, skin.colors[2]);

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Specular highlight
        ctx.beginPath();
        ctx.arc(p.x - r * 0.25, p.y - r * 0.25, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();

        // Rolling lines (rotation effect)
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.clip();

        const lineCount = 4;
        for (let i = 0; i < lineCount; i++) {
            const angle = ball.rotationX + (i * Math.PI / lineCount);
            const offsetY = Math.sin(angle) * r;
            ctx.beginPath();
            ctx.moveTo(p.x - r, p.y + offsetY);
            ctx.lineTo(p.x + r, p.y + offsetY);
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();

        // Glow effect
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.4, 0, Math.PI * 2);
        const glowGrad = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 1.4);
        glowGrad.addColorStop(0, skin.colors[0] + '30');
        glowGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGrad;
        ctx.fill();
    }

    function drawObstacle(obs) {
        if (obs.type === 'slider') {
            const obsX = Math.sin(time * obs.speed * 60 + obs.phase) * (TRACK_WIDTH / 2 - obs.width / 2);
            drawBox(obsX, obs.height / 2, obs.z, obs.width, obs.height, 0.5, obs.color);
        } else if (obs.type === 'hammer') {
            const angle = time * obs.speed * 60 + obs.phase;
            const hammerX = Math.sin(angle) * obs.armLength;
            const hammerZ = obs.z + Math.cos(angle) * 0.3;

            // Arm
            const center = project(0, 0.8, obs.z);
            const end = project(hammerX, 0.8, hammerZ);
            if (center && end) {
                ctx.beginPath();
                ctx.moveTo(center.x, center.y);
                ctx.lineTo(end.x, end.y);
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 3 * Math.min(1, center.scale / 50);
                ctx.stroke();
            }

            // Hammer head
            drawBox(hammerX, 0.5, hammerZ, 0.8, 1, 0.8, obs.color);

            // Center pivot
            const pivotP = project(0, 0.8, obs.z);
            if (pivotP && pivotP.depth < 80) {
                ctx.beginPath();
                ctx.arc(pivotP.x, pivotP.y, 4 * (pivotP.scale / 50), 0, Math.PI * 2);
                ctx.fillStyle = '#666';
                ctx.fill();
            }
        } else if (obs.type === 'wall') {
            // Left wall section
            const leftWidth = (TRACK_WIDTH / 2 + obs.gapX - obs.gapWidth / 2);
            if (leftWidth > 0.1) {
                const leftCenterX = (-TRACK_WIDTH / 2 + (obs.gapX - obs.gapWidth / 2)) / 2;
                drawBox(leftCenterX, obs.height / 2, obs.z, leftWidth, obs.height, 0.3, obs.color);
            }
            // Right wall section
            const rightEdge = obs.gapX + obs.gapWidth / 2;
            const rightWidth = (TRACK_WIDTH / 2 - rightEdge);
            if (rightWidth > 0.1) {
                const rightCenterX = (rightEdge + TRACK_WIDTH / 2) / 2;
                drawBox(rightCenterX, obs.height / 2, obs.z, rightWidth, obs.height, 0.3, obs.color);
            }
        } else if (obs.type === 'pillar') {
            const p = project(obs.x, obs.height / 2, obs.z);
            if (!p || p.depth > 80) return;
            const r = obs.radius * p.scale;
            const h = obs.height * p.scale;

            // Pillar body
            const grad = ctx.createLinearGradient(p.x - r, p.y, p.x + r, p.y);
            grad.addColorStop(0, shadeColor(obs.color, -20));
            grad.addColorStop(0.5, obs.color);
            grad.addColorStop(1, shadeColor(obs.color, -30));

            ctx.beginPath();
            ctx.ellipse(p.x, p.y, r, h / 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            // Top glow
            ctx.beginPath();
            const topP = project(obs.x, obs.height, obs.z);
            if (topP) {
                ctx.arc(topP.x, topP.y, r * 0.6, 0, Math.PI * 2);
                ctx.fillStyle = shadeColor(obs.color, 40) + '80';
                ctx.fill();
            }
        }
    }

    function drawBox(x, y, z, w, h, d, color) {
        // Front face
        const fl = project(x - w / 2, y + h / 2, z + d / 2);
        const fr = project(x + w / 2, y + h / 2, z + d / 2);
        const bl_ = project(x - w / 2, y - h / 2, z + d / 2);
        const br_ = project(x + w / 2, y - h / 2, z + d / 2);

        // Back face
        const fl2 = project(x - w / 2, y + h / 2, z - d / 2);
        const fr2 = project(x + w / 2, y + h / 2, z - d / 2);
        const bl2 = project(x - w / 2, y - h / 2, z - d / 2);
        const br2 = project(x + w / 2, y - h / 2, z - d / 2);

        if (!fl || !fr || !bl_ || !br_) return;

        // Top face
        if (fl2 && fr2) {
            ctx.beginPath();
            ctx.moveTo(fl.x, fl.y);
            ctx.lineTo(fr.x, fr.y);
            ctx.lineTo(fr2.x, fr2.y);
            ctx.lineTo(fl2.x, fl2.y);
            ctx.closePath();
            ctx.fillStyle = shadeColor(color, 20);
            ctx.fill();
        }

        // Front face
        ctx.beginPath();
        ctx.moveTo(fl.x, fl.y);
        ctx.lineTo(fr.x, fr.y);
        ctx.lineTo(br_.x, br_.y);
        ctx.lineTo(bl_.x, bl_.y);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // Right face
        if (fr2 && br2) {
            ctx.beginPath();
            ctx.moveTo(fr.x, fr.y);
            ctx.lineTo(fr2.x, fr2.y);
            ctx.lineTo(br2.x, br2.y);
            ctx.lineTo(br_.x, br_.y);
            ctx.closePath();
            ctx.fillStyle = shadeColor(color, -15);
            ctx.fill();
        }

        // Highlight edge
        ctx.beginPath();
        ctx.moveTo(fl.x, fl.y);
        ctx.lineTo(fr.x, fr.y);
        ctx.strokeStyle = shadeColor(color, 40) + '60';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function drawCoin(coin) {
        if (coin.collected) return;
        const p = project(coin.x, coin.y + Math.sin(time * 3 + coin.rotation) * 0.15, coin.z);
        if (!p || p.depth > 60) return;

        const r = 0.25 * p.scale;
        coin.rotation += 0.05;

        // Coin squish for rotation effect
        const squish = Math.abs(Math.sin(coin.rotation));

        // Coin body
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * Math.max(0.2, squish), r, 0, 0, Math.PI * 2);
        const coinGrad = ctx.createRadialGradient(p.x, p.y - r * 0.3, 0, p.x, p.y, r);
        coinGrad.addColorStop(0, '#fef08a');
        coinGrad.addColorStop(0.5, '#fbbf24');
        coinGrad.addColorStop(1, '#d97706');
        ctx.fillStyle = coinGrad;
        ctx.fill();

        // Coin glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2);
        const glowGrad = ctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r * 1.8);
        glowGrad.addColorStop(0, 'rgba(251, 191, 36, 0.3)');
        glowGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGrad;
        ctx.fill();
        ctx.restore();
    }

    function drawDecoration(dec) {
        const bobY = dec.y + Math.sin(time * 1.5 + dec.phase) * 0.5;
        const p = project(dec.x, bobY, dec.z);
        if (!p || p.depth > 70) return;

        const s = dec.size * p.scale;
        ctx.save();
        ctx.globalAlpha = 0.4;

        // Diamond shape
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x + s * 0.6, p.y);
        ctx.lineTo(p.x, p.y + s);
        ctx.lineTo(p.x - s * 0.6, p.y);
        ctx.closePath();

        ctx.fillStyle = currentTheme.accent;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 1.5, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 1.5);
        grad.addColorStop(0, currentTheme.accent + '40');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.restore();
    }

    function drawParticle(p) {
        const proj = project(p.x, p.y, p.z);
        if (!proj || proj.depth > 60) return;

        const s = p.size * proj.scale;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, Math.max(1, s), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawTrail() {
        for (const t of ball.trail) {
            const p = project(t.x, t.y, t.z);
            if (!p || p.depth > 50) continue;

            const r = 0.15 * p.scale * t.life;
            ctx.globalAlpha = t.life * 0.4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2);
            ctx.fillStyle = SKINS[currentSkin].colors[1];
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawBackground() {
        // Sky gradient
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, currentTheme.sky1);
        grad.addColorStop(0.5, currentTheme.sky2);
        grad.addColorStop(1, currentTheme.fog);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Stars
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 80; i++) {
            const sx = ((i * 137.5 + time * 2) % canvas.width);
            const sy = ((i * 97.3) % (canvas.height * 0.5));
            const ss = 0.5 + Math.sin(time * 2 + i) * 0.5;
            ctx.globalAlpha = 0.3 + Math.sin(time * 3 + i * 0.5) * 0.2;
            ctx.beginPath();
            ctx.arc(sx, sy, ss, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Distant mountains / horizon
        ctx.beginPath();
        ctx.moveTo(0, canvas.height * 0.65);
        for (let x = 0; x <= canvas.width; x += 40) {
            const h = Math.sin(x * 0.005 + time * 0.1) * 30 + Math.sin(x * 0.01) * 20;
            ctx.lineTo(x, canvas.height * 0.6 + h);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        ctx.fillStyle = currentTheme.fog;
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawFinishLine() {
        const finishZ = (levelLength - 5) * TRACK_SEGMENT_LEN;
        const p1 = project(-TRACK_WIDTH / 2, 0, finishZ);
        const p2 = project(TRACK_WIDTH / 2, 0, finishZ);
        const p3 = project(-TRACK_WIDTH / 2, 2, finishZ);
        const p4 = project(TRACK_WIDTH / 2, 2, finishZ);

        if (!p1 || !p2 || !p3 || !p4) return;
        if (p1.depth > 80) return;

        // Checkered finish
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.stroke();

        // "FINISH" text banner
        const midX = (p3.x + p4.x) / 2;
        const midY = (p3.y + p4.y) / 2;
        const fontSize = Math.max(10, 18 * (p1.scale / 50));
        ctx.font = `900 ${fontSize}px Outfit`;
        ctx.fillStyle = '#10b981';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.7 + Math.sin(time * 4) * 0.3;
        ctx.fillText('🏁 FINISH', midX, midY);
        ctx.globalAlpha = 1;
    }

    // ===== Main Render =====
    function render() {
        drawBackground();

        if (!trackGenerated) return;

        // Determine visible range
        const camSegStart = Math.max(0, Math.floor((camera.z) / TRACK_SEGMENT_LEN) - 2);
        const camSegEnd = Math.min(trackSegments.length - 1, camSegStart + 50);

        // Draw from back to front
        // 1. Decorations (back)
        for (let i = camSegEnd; i >= camSegStart; i--) {
            for (const dec of decorations) {
                const decSeg = Math.floor(dec.z / TRACK_SEGMENT_LEN);
                if (decSeg === i) {
                    drawDecoration(dec);
                }
            }
        }

        // 2. Track segments (back to front)
        for (let i = camSegEnd; i >= camSegStart; i--) {
            const seg = trackSegments[i];
            const nextSeg = i < trackSegments.length - 1 ? trackSegments[i + 1] : null;
            drawTrackSegment(seg, nextSeg, i);
        }

        // 3. Trail
        drawTrail();

        // 4. Coins (back to front)
        const visibleCoins = coinItems.filter(c => {
            const seg = Math.floor(c.z / TRACK_SEGMENT_LEN);
            return seg >= camSegStart && seg <= camSegEnd;
        }).sort((a, b) => b.z - a.z);
        for (const coin of visibleCoins) {
            drawCoin(coin);
        }

        // 5. Obstacles (back to front)
        const visibleObs = obstacles.filter(o => {
            const seg = Math.floor(o.z / TRACK_SEGMENT_LEN);
            return seg >= camSegStart - 2 && seg <= camSegEnd;
        }).sort((a, b) => b.z - a.z);
        for (const obs of visibleObs) {
            drawObstacle(obs);
        }

        // 6. Finish line
        drawFinishLine();

        // 7. Ball
        if (ball.alive || gameState === STATE.LEVEL_COMPLETE) {
            drawBall();
        }

        // 8. Particles (always on top)
        for (const p of particles) {
            drawParticle(p);
        }

        // Fog overlay at bottom
        const fogGrad = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
        fogGrad.addColorStop(0, 'transparent');
        fogGrad.addColorStop(1, currentTheme.fog + '80');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);
    }

    // ===== Menu Background Animation =====
    function renderMenuBG() {
        // Animated gradient background
        const t = time;
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#0f0a1e');
        grad.addColorStop(0.3, '#1a1035');
        grad.addColorStop(0.6, '#2d1b69');
        grad.addColorStop(1, '#0f0a1e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Floating orbs
        for (let i = 0; i < 15; i++) {
            const x = canvas.width * 0.5 + Math.sin(t * 0.5 + i * 1.3) * canvas.width * 0.4;
            const y = canvas.height * 0.5 + Math.cos(t * 0.7 + i * 0.9) * canvas.height * 0.35;
            const r = 30 + Math.sin(t + i) * 15;

            const orbGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
            orbGrad.addColorStop(0, 'rgba(124, 58, 237, 0.15)');
            orbGrad.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = orbGrad;
            ctx.fill();
        }
    }

    // ===== Game Loop =====
    function gameLoop(timestamp) {
        const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
        lastTime = timestamp;

        if (gameState === STATE.MENU || gameState === STATE.GAMEOVER || gameState === STATE.LEVEL_COMPLETE) {
            time += dt;
            renderMenuBG();

            // Still render game in background if game over
            if ((gameState === STATE.GAMEOVER || gameState === STATE.LEVEL_COMPLETE) && trackGenerated) {
                // Update particles even in game over
                particles = particles.filter(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.z += p.vz;
                    p.vy -= 0.005;
                    p.life -= p.decay;
                    return p.life > 0;
                });
                render();
            }
        } else if (gameState === STATE.PLAYING) {
            update(dt);
            render();
        }

        requestAnimationFrame(gameLoop);
    }

    // ===== Utility =====
    function shadeColor(color, percent) {
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);

        R = Math.min(255, Math.max(0, Math.floor(R * (100 + percent) / 100)));
        G = Math.min(255, Math.max(0, Math.floor(G * (100 + percent) / 100)));
        B = Math.min(255, Math.max(0, Math.floor(B * (100 + percent) / 100)));

        return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
    }

    // ===== Start =====
    requestAnimationFrame(gameLoop);

})();
