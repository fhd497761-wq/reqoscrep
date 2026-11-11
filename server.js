const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const { QureoSolver } = require('./qureo-solver');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const activeSessions = new Map();

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'start_solving') {
                const { studentId, password } = data;
                if (!studentId || !password) {
                    ws.send(JSON.stringify({ type: 'error', message: 'يرجى إدخال البيانات' }));
                    return;
                }
                ws.send(JSON.stringify({ type: 'status', message: 'جاري بدء النظام...', progress: 0, step: 'initializing' }));
                const solver = new QureoSolver(studentId, password, (update) => {
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(update));
                });
                activeSessions.set(studentId, solver);
                try {
                    await solver.start();
                } catch (error) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'error', message: 'خطأ: ' + error.message }));
                    }
                } finally {
                    activeSessions.delete(studentId);
                }
            }
            if (data.type === 'stop_solving') {
                const solver = activeSessions.get(data.studentId);
                if (solver) {
                    await solver.stop();
                    activeSessions.delete(data.studentId);
                }
            }
        } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: 'خطأ في المعالجة' }));
        }
    });
    ws.on('close', () => console.log('Client disconnected'));
});

setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('FAHD & DALO Server running on http://localhost:' + PORT);
});