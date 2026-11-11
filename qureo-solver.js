const { chromium } = require('playwright');

class QureoSolver {
    constructor(studentId, password, onUpdate) {
        this.studentId = studentId;
        this.password = password;
        this.onUpdate = onUpdate;
        this.browser = null;
        this.page = null;
        this.isRunning = false;
        this.solvedQuestions = 0;
        this.totalLessons = 0;
        this.completedLessons = 0;
    }

    send(type, message, progress, step, extra) {
        this.onUpdate(Object.assign({
            type, message, progress: Math.round(progress), step,
            solvedQuestions: this.solvedQuestions,
            completedLessons: this.completedLessons,
            totalLessons: this.totalLessons
        }, extra || {}));
    }

    async start() {
        this.isRunning = true;
        try {
            this.send('status', 'جاري فتح المتصفح...', 5, 'launching');
            this.browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
            });
            const ctx = await this.browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                locale: 'ar-EG'
            });
            this.page = await ctx.newPage();
            this.page.setDefaultTimeout(60000);
            this.page.setDefaultNavigationTimeout(60000);

            this.send('status', 'جاري الدخول لمنصة Qureo...', 10, 'navigating');
            await this.page.goto('https://me-portal.qureo.education/login', { waitUntil: 'networkidle' });
            await this.page.waitForTimeout(3000);

            this.send('status', 'اختيار طريقة تسجيل الدخول...', 15, 'selecting_login');
            await this.selectLoginOption();

            this.send('status', 'إدخال بيانات الطالب...', 20, 'entering_credentials');
            await this.enterCredentials();

            this.send('status', 'تسجيل الدخول...', 30, 'logging_in');
            await this.waitForDashboard();

            this.send('status', 'تحميل الدروس...', 35, 'loading_lessons');
            await this.loadAndSolveLessons();

            this.send('success', 'تم حل جميع المهام بنجاح! 🎉', 100, 'completed');
        } catch (error) {
            this.send('error', 'خطأ: ' + error.message, 0, 'error');
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async selectLoginOption() {
        await this.page.waitForTimeout(2000);
        const selectors = [
            'button:nth-child(2)', '.login-option:nth-child(2)',
            '.auth-option:last-child', 'button:has-text("Student")',
            'button:has-text("طالب")', '.login-card:nth-child(2)',
            'div[role="button"]:nth-child(2)'
        ];
        for (const s of selectors) {
            try {
                const el = await this.page.$(s);
                if (el) { await el.click(); await this.page.waitForTimeout(3000); return; }
            } catch (e) { continue; }
        }
        const btns = await this.page.$$('button, a, div[role="button"]');
        if (btns.length >= 2) { await btns[1].click(); await this.page.waitForTimeout(3000); }
    }

    async enterCredentials() {
        await this.page.waitForTimeout(2000);
        const idSels = ['input[name="username"]', 'input[name="studentId"]', 'input[name="id"]', 'input[name="email"]', '#username', '#studentId', 'input[type="text"]:first-of-type', 'input:first-of-type'];
        let idF = null;
        for (const s of idSels) { try { idF = await this.page.$(s); if (idF) break; } catch (e) { continue; } }
        if (!idF) { const ins = await this.page.$$('input'); if (ins.length > 0) idF = ins[0]; }
        if (idF) { await idF.click(); await idF.fill(''); await idF.type(this.studentId, { delay: 50 }); }

        const pwSels = ['input[name="password"]', 'input[type="password"]', '#password'];
        let pwF = null;
        for (const s of pwSels) { try { pwF = await this.page.$(s); if (pwF) break; } catch (e) { continue; } }
        if (!pwF) { const ins = await this.page.$$('input'); if (ins.length > 1) pwF = ins[1]; }
        if (pwF) { await pwF.click(); await pwF.fill(''); await pwF.type(this.password, { delay: 50 }); }

        await this.page.waitForTimeout(1000);
        const btnSels = ['button[type="submit"]', 'button:has-text("Login")', 'button:has-text("تسجيل")', 'button:has-text("دخول")', 'form button'];
        let clicked = false;
        for (const s of btnSels) { try { const b = await this.page.$(s); if (b) { await b.click(); clicked = true; break; } } catch (e) { continue; } }
        if (!clicked) await this.page.keyboard.press('Enter');
    }

    async waitForDashboard() {
        await this.page.waitForTimeout(5000);
        let url = this.page.url();
        if (url.includes('login')) {
            await this.page.waitForTimeout(10000);
            url = this.page.url();
            if (url.includes('login')) throw new Error('فشل تسجيل الدخول - تأكد من البيانات');
        }
        this.send('status', 'تم تسجيل الدخول بنجاح! ✅', 35, 'logged_in');
    }

    async loadAndSolveLessons() {
        await this.page.waitForTimeout(3000);
        const navSels = ['a:has-text("المهام")', 'a:has-text("الدروس")', 'a:has-text("Assignments")', 'a:has-text("Lessons")', '[href*="assignment"]', '[href*="lesson"]'];
        for (const s of navSels) {
            try { const el = await this.page.$(s); if (el) { await el.click(); await this.page.waitForTimeout(3000); break; } } catch (e) { continue; }
        }
        const lesSels = ['.lesson-card', '.assignment-card', '.task-card', '.card', '[class*="lesson"]', '[class*="assignment"]'];
        let lessons = [];
        for (const s of lesSels) { lessons = await this.page.$$(s); if (lessons.length > 0) break; }
        if (lessons.length === 0) { this.send('status', 'جاري البحث...', 40, 'searching'); await this.solveCurrentLesson(); return; }
        this.totalLessons = lessons.length;
        this.send('status', 'تم العثور على ' + this.totalLessons + ' درس', 40, 'found_lessons');
        for (let i = 0; i < this.totalLessons && this.isRunning; i++) {
            this.completedLessons = i;
            const p = 40 + ((i / this.totalLessons) * 55);
            this.send('status', 'حل الدرس ' + (i + 1) + ' من ' + this.totalLessons, p, 'solving_lesson');
            try {
                const cur = await this.page.$$(lesSels.find(s => lessons.length > 0) || '.card');
                if (cur[i]) { await cur[i].click(); await this.page.waitForTimeout(3000); await this.solveCurrentLesson(); await this.page.goBack(); await this.page.waitForTimeout(2000); }
            } catch (e) {
                this.send('warning', 'تخطي الدرس ' + (i + 1), p, 'skip_lesson');
                try { await this.page.goBack(); await this.page.waitForTimeout(2000); } catch (x) { await this.page.goto('https://me-portal.qureo.education/', { waitUntil: 'networkidle' }); }
            }
        }
        this.completedLessons = this.totalLessons;
    }

    async solveCurrentLesson() {
        await this.page.waitForTimeout(3000);
        let qi = 0, max = 50;
        while (this.isRunning && max-- > 0) {
            const hasQ = await this.detectQuestion();
            if (!hasQ) { if (await this.checkComplete()) break; if (!(await this.clickNext())) break; await this.page.waitForTimeout(2000); continue; }
            qi++; this.solvedQuestions++;
            this.send('status', 'حل السؤال ' + qi + '...', 40 + ((this.completedLessons / Math.max(this.totalLessons, 1)) * 55), 'solving_question');
            await this.solveQuestion();
            await this.page.waitForTimeout(2000);
            await this.clickNext();
            await this.page.waitForTimeout(2000);
        }
    }

    async detectQuestion() {
        const sels = ['.question', '.quiz-question', '.exercise', '[class*="question"]', '[class*="quiz"]', '.answer-option', 'input[type="radio"]', 'input[type="checkbox"]', '.option-item'];
        for (const s of sels) { try { if (await this.page.$(s)) return true; } catch (e) { continue; } }
        return false;
    }

    async solveQuestion() {
        const optSels = ['.answer-option', '.choice', '.option', '.option-item', 'label:has(input[type="radio"])', 'input[type="radio"]', 'input[type="checkbox"]', '[class*="option"]', '[class*="choice"]'];
        let opts = [];
        for (const s of optSels) { try { opts = await this.page.$$(s); if (opts.length > 1) break; } catch (e) { continue; } }
        if (opts.length > 0) {
            for (let i = 0; i < opts.length; i++) {
                try {
                    await opts[i].click(); await this.page.waitForTimeout(1500);
                    const ok = await this.checkCorrect(); const wrong = await this.checkWrong();
                    if (ok || !wrong) break;
                } catch (e) { continue; }
            }
        }
        const inSels = ['input[type="text"]', 'textarea', 'input[type="number"]'];
        for (const s of inSels) { try { const inp = await this.page.$(s); if (inp) { await inp.fill('1'); break; } } catch (e) { continue; } }
        await this.handleCoding();
    }

    async handleCoding() {
        const bSels = ['.blockly-workspace', '.coding-area', '[class*="block"]', 'canvas', '.code-editor'];
        for (const s of bSels) {
            try {
                if (await this.page.$(s)) {
                    const rSels = ['button:has-text("Run")', 'button:has-text("تشغيل")', 'button:has-text("Submit")', 'button:has-text("إرسال")', 'button:has-text("Check")', '.run-button', '.play-button'];
                    for (const r of rSels) { try { const b = await this.page.$(r); if (b) { await b.click(); await this.page.waitForTimeout(3000); break; } } catch (e) { continue; } }
                    break;
                }
            } catch (e) { continue; }
        }
    }

    async checkCorrect() {
        for (const s of ['.correct', '.right', '.success', '[class*="correct"]', '.green']) { try { if (await this.page.$(s)) return true; } catch (e) { continue; } }
        return false;
    }

    async checkWrong() {
        for (const s of ['.wrong', '.incorrect', '[class*="wrong"]', '.red']) { try { if (await this.page.$(s)) return true; } catch (e) { continue; } }
        return false;
    }

    async checkComplete() {
        for (const s of ['.complete', '.completed', '.finished', '[class*="complete"]', ':has-text("أحسنت")', ':has-text("Congratulations")', '.result-page']) { try { if (await this.page.$(s)) return true; } catch (e) { continue; } }
        return false;
    }

    async clickNext() {
        const sels = ['button:has-text("Next")', 'button:has-text("التالي")', 'button:has-text("Start")', 'button:has-text("ابدأ")', 'button:has-text("Submit")', 'button:has-text("إرسال")', 'button:has-text("Continue")', 'button:has-text("متابعة")', 'button:has-text("Check")', 'button:has-text("فحص")', 'button.primary', 'button.btn-primary'];
        for (const s of sels) { try { const b = await this.page.$(s); if (b && await b.isVisible()) { await b.click(); return true; } } catch (e) { continue; } }
        return false;
    }

    async stop() { this.isRunning = false; await this.cleanup(); }

    async cleanup() { try { if (this.browser) { await this.browser.close(); this.browser = null; } } catch (e) {} }
}

module.exports = { QureoSolver };