// ===== PARTICLES =====
class Particles {
    constructor() {
        this.c = document.getElementById('particleCanvas');
        this.x = this.c.getContext('2d');
        this.p = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
        for (let i = 0; i < 60; i++) {
            this.p.push({
                x: Math.random() * this.c.width, y: Math.random() * this.c.height,
                s: Math.random() * 2 + .5, vx: (Math.random() - .5) * .5, vy: (Math.random() - .5) * .5,
                o: Math.random() * .5 + .1,
                c: ['#7b2ff7', '#00f5d4', '#ff2d87', '#4834d4'][Math.floor(Math.random() * 4)]
            });
        }
        this.draw();
    }
    resize() { this.c.width = innerWidth; this.c.height = innerHeight; }
    draw() {
        this.x.clearRect(0, 0, this.c.width, this.c.height);
        this.p.forEach((a, i) => {
            a.x += a.vx; a.y += a.vy;
            if (a.x < 0) a.x = this.c.width; if (a.x > this.c.width) a.x = 0;
            if (a.y < 0) a.y = this.c.height; if (a.y > this.c.height) a.y = 0;
            this.x.beginPath(); this.x.arc(a.x, a.y, a.s, 0, Math.PI * 2);
            this.x.fillStyle = a.c; this.x.globalAlpha = a.o; this.x.fill();
            this.p.forEach((b, j) => {
                if (i === j) return;
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (d < 120) {
                    this.x.beginPath(); this.x.moveTo(a.x, a.y); this.x.lineTo(b.x, b.y);
                    this.x.strokeStyle = a.c; this.x.globalAlpha = (1 - d / 120) * .15;
                    this.x.lineWidth = .5; this.x.stroke();
                }
            });
        });
        this.x.globalAlpha = 1;
        requestAnimationFrame(() => this.draw());
    }
}

// ===== STARS =====
function makeStars() {
    const box = document.getElementById('stars');
    for (let i = 0; i < 80; i++) {
        const s = document.createElement('div');
        s.className = 'star';
        s.style.left = Math.random() * 100 + '%';
        s.style.top = Math.random() * 100 + '%';
        s.style.setProperty('--dur', (Math.random() * 3 + 2) + 's');
        s.style.setProperty('--op', Math.random() * .7 + .3);
        s.style.animationDelay = Math.random() * 5 + 's';
        box.appendChild(s);
    }
}

// ===== APP =====
class App {
    constructor() {
        this.ws = null;
        this.running = false;
        this.sid = '';
        this.t0 = null;
        this.timer = null;

        this.$login = document.getElementById('loginSection');
        this.$progress = document.getElementById('progressSection');
        this.$success = document.getElementById('successSection');
        this.$form = document.getElementById('loginForm');
        this.$id = document.getElementById('studentId');
        this.$pw = document.getElementById('password');
        this.$ring = document.getElementById('progressRing');
        this.$pct = document.getElementById('progressPct');
        this.$bar = document.getElementById('progressBar');
        this.$title = document.getElementById('progressTitle');
        this.$sub = document.getElementById('progressSubtitle');
        this.$status = document.getElementById('currentStatus');
        this.$solved = document.getElementById('solvedCount');
        this.$lessons = document.getElementById('lessonCount');
        this.$time = document.getElementById('timeElapsed');
        this.$step = document.getElementById('statusStep');
        this.$log = document.getElementById('logBox');

        this.$form.addEventListener('submit', e => { e.preventDefault(); this.start(); });
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        document.getElementById('restartBtn').addEventListener('click', () => this.restart());
        document.getElementById('togglePw').addEventListener('click', () => {
            const t = this.$pw.type === 'password' ? 'text' : 'password';
            this.$pw.type = t;
            document.getElementById('togglePw').textContent = t === 'text' ? '🙈' : '👁️';
        });
    }

    connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(proto + '//' + location.host);
        this.ws.onopen = () => this.log('تم الاتصال بالسيرفر', 'success');
        this.ws.onmessage = e => this.handle(JSON.parse(e.data));
        this.ws.onerror = () => this.log('خطأ في الاتصال', 'error');
        this.ws.onclose = () => { if (this.running) setTimeout(() => this.connect(), 3000); };
    }

    start() {
        this.sid = this.$id.value.trim();
        const pw = this.$pw.value.trim();
        if (!this.sid || !pw) return;
        this.running = true;
        this.t0 = Date.now();
        this.startTimer();
        this.$login.style.display = 'none';
        this.$progress.style.display = 'block';
        this.$progress.classList.add('fade-in');
        this.$success.style.display = 'none';
        this.setProg(0);
        this.$log.innerHTML = '';
        this.log('جاري بدء النظام...');
        this.connect();
        const send = () => {
            if (this.ws && this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: 'start_solving', studentId: this.sid, password: pw }));
            } else setTimeout(send, 500);
        };
        setTimeout(send, 1000);
    }

    stop() {
        this.running = false;
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({ type: 'stop_solving', studentId: this.sid }));
        }
        this.stopTimer();
        this.log('تم الإيقاف', 'error');
        setTimeout(() => this.restart(), 2000);
    }

    restart() {
        this.running = false;
        this.stopTimer();
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.$login.style.display = 'block';
        this.$progress.style.display = 'none';
        this.$success.style.display = 'none';
        this.$form.reset();
        this.setProg(0);
    }

    handle(d) {
        if (d.type === 'status') {
            if (d.progress !== undefined) this.setProg(d.progress);
            if (d.message) {
                this.$status.innerHTML = '<div class="status-dot"></div><span>' + d.message + '</span>';
                this.$status.className = 'status-item active';
                this.log(d.message);
            }
            const steps = { initializing: 'تهيئة', launching: 'متصفح', navigating: 'دخول', selecting_login: 'اختيار', entering_credentials: 'بيانات', logging_in: 'تسجيل', logged_in: '✅ دخول', loading_lessons: 'تحميل', found_lessons: 'دروس', searching: 'بحث', solving_lesson: 'درس', solving_question: 'سؤال', skip_lesson: 'تخطي', completed: '✅ تم', stopped: 'متوقف' };
            if (d.step) { this.$step.textContent = steps[d.step] || d.step; this.$title.textContent = d.message || 'جاري...'; }
            if (d.solvedQuestions !== undefined) this.$solved.textContent = d.solvedQuestions;
            if (d.completedLessons !== undefined) this.$lessons.textContent = (d.completedLessons || 0) + '/' + (d.totalLessons || 0);
        }
        if (d.type === 'success') {
            this.running = false; this.stopTimer();
            this.log(d.message || 'تم بنجاح! 🎉', 'success');
            document.getElementById('finalSolved').textContent = d.solvedQuestions || 0;
            document.getElementById('finalLessons').textContent = d.completedLessons || 0;
            document.getElementById('finalTime').textContent = this.$time.textContent;
            setTimeout(() => {
                this.$progress.style.display = 'none';
                this.$success.style.display = 'block';
                this.$success.classList.add('fade-in');
                this.confetti();
            }, 1500);
        }
        if (d.type === 'error') {
            this.$status.innerHTML = '<div class="status-dot"></div><span>' + d.message + '</span>';
            this.$status.className = 'status-item error';
            this.log(d.message, 'error');
            this.$title.textContent = 'حدث خطأ';
        }
        if (d.type === 'warning') this.log(d.message, 'error');
    }

    setProg(p) {
        const off = 534 - (p / 100) * 534;
        this.$ring.style.strokeDashoffset = off;
        this.$pct.textContent = Math.round(p) + '%';
        this.$bar.style.width = p + '%';
    }

    log(msg, type) {
        const t = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const el = document.createElement('div');
        el.className = 'log-item ' + (type || '');
        el.innerHTML = '<span class="log-time">' + t + '</span><span class="log-msg">' + msg + '</span>';
        this.$log.insertBefore(el, this.$log.firstChild);
        while (this.$log.children.length > 50) this.$log.removeChild(this.$log.lastChild);
    }

    startTimer() {
        this.timer = setInterval(() => {
            const s = Math.floor((Date.now() - this.t0) / 1000);
            this.$time.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        }, 1000);
    }

    stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

    confetti() {
        const colors = ['#7b2ff7', '#00f5d4', '#ff2d87', '#ffa502'];
        for (let i = 0; i < 40; i++) {
            setTimeout(() => {
                const c = document.createElement('div');
                c.style.cssText = 'position:fixed;top:-10px;left:' + Math.random() * 100 + '%;width:' + (Math.random() * 10 + 5) + 'px;height:' + (Math.random() * 10 + 5) + 'px;background:' + colors[i % 4] + ';border-radius:' + (Math.random() > .5 ? '50%' : '0') + ';z-index:1000;pointer-events:none;animation:cfall ' + (Math.random() * 2 + 2) + 's ease forwards';
                document.body.appendChild(c);
                setTimeout(() => c.remove(), 4000);
            }, i * 50);
        }
        if (!document.getElementById('cfstyle')) {
            const s = document.createElement('style');
            s.id = 'cfstyle';
            s.textContent = '@keyframes cfall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}';
            document.head.appendChild(s);
        }
    }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    makeStars();
    new Particles();
    new App();
});