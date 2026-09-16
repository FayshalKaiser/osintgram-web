let serverUrl = '';
let connected = false;
let target = '';
let resultHistory = [];
let toolsData = [];

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.className = 'toast hidden', 3000);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function toggleGroup(el) {
    el.parentElement.classList.toggle('collapsed');
}

function filterCommands(query) {
    const items = document.querySelectorAll('.nav-item');
    const q = query.toLowerCase();
    items.forEach(item => {
        const name = item.dataset.cmd;
        const desc = item.querySelector('.cmd-desc').textContent.toLowerCase();
        item.style.display = (name.includes(q) || desc.includes(q)) ? '' : 'none';
    });
}

async function connectServer() {
    const url = document.getElementById('serverUrl').value.trim().replace(/\/$/, '');
    if (!url) return showToast('Enter server URL', 'error');

    serverUrl = url;
    const statusEl = document.getElementById('serverStatus');
    statusEl.innerHTML = '<span class="loading-spinner"></span> Connecting...';

    try {
        const resp = await fetch(`${serverUrl}/api/about`);
        if (resp.ok) {
            const data = await resp.json();
            connected = true;
            statusEl.innerHTML = '<span class="dot dot-green"></span> Connected';
            showToast('Connected to Osintgram', 'success');
            loadTools();
            loadBalance();
        } else {
            throw new Error(`HTTP ${resp.status}`);
        }
    } catch (e) {
        connected = false;
        statusEl.innerHTML = '<span class="dot dot-red"></span> Connection failed';
        if (window.location.protocol === 'https:' && url.startsWith('http://')) {
            showToast('HTTPS site cannot connect to HTTP server. Use ngrok or run locally.', 'error');
        } else {
            showToast('Cannot reach server. Is Osintgram running?', 'error');
        }
    }
}

async function loadTools() {
    try {
        const resp = await fetch(`${serverUrl}/api/tools`);
        if (resp.ok) {
            toolsData = await resp.json();
            renderDynamicCommands();
        }
    } catch (e) {}
}

async function loadBalance() {
    try {
        const resp = await fetch(`${serverUrl}/api/balance`);
        if (resp.ok) {
            const data = await resp.json();
            document.getElementById('balanceInfo').innerHTML = `<span class="dot dot-green"></span> Balance: ${data.balance || 'N/A'}`;
        }
    } catch (e) {}
}

function renderDynamicCommands() {
    if (!toolsData || !toolsData.length) return;
    const container = document.getElementById('dynamicCommands');
    if (!container) return;

    let html = '';
    toolsData.forEach(tool => {
        const cmd = tool.name || tool.id || '';
        const desc = tool.description || tool.help || '';
        const needsInput = tool.parameters && tool.parameters.length > 0;
        html += `<button class="nav-item" onclick="runCmd('${cmd}')" data-cmd="${cmd}">
            <span class="cmd-name">${cmd}</span>
            <span class="cmd-desc">${desc}</span>
        </button>`;
    });
    container.innerHTML = html;
}

async function setTarget() {
    const username = document.getElementById('targetInput').value.trim();
    if (!username) return showToast('Enter a username', 'error');
    if (!connected) return showToast('Connect to server first', 'error');

    target = username;
    document.getElementById('targetInfo').innerHTML = `<span class="dot dot-green"></span> Target: @${target}`;
    document.getElementById('topbarTitle').textContent = `Osintgram — @${target}`;
    showToast(`Target set to @${target}`, 'success');

    await runCmd('info');
}

async function runCmd(cmd) {
    if (!connected) return showToast('Connect to server first', 'error');

    const navItem = document.querySelector(`.nav-item[data-cmd="${cmd}"]`);
    if (navItem) navItem.classList.add('running');

    const content = document.getElementById('content');
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
        <div class="result-header">
            <h3><span class="loading-spinner"></span> ${cmd}</h3>
            <span class="status-badge">Running</span>
        </div>
        <div class="result-body"><pre>Executing ${cmd}...</pre></div>
    `;
    content.insertBefore(card, content.firstChild);

    const commandsNeedingInput = {
        'hashtag': { param: 'hashtag', placeholder: 'Enter hashtag (without #)' },
        'place': { param: 'place', placeholder: 'Enter place name' },
        'smash': { param: 'count', placeholder: 'Number of posts to like' },
        'search': { param: 'query', placeholder: 'Search query' },
    };

    let input = null;
    if (commandsNeedingInput[cmd]) {
        input = prompt(commandsNeedingInput[cmd].placeholder);
        if (input === null) {
            card.remove();
            if (navItem) navItem.classList.remove('running');
            return;
        }
    }

    try {
        let url = `${serverUrl}/api/${cmd}`;
        const params = new URLSearchParams();
        if (target) params.set('target', target);
        if (input && commandsNeedingInput[cmd]) {
            params.set(commandsNeedingInput[cmd].param, input);
        }
        const qs = params.toString();
        if (qs) url += `?${qs}`;

        const resp = await fetch(url);
        const data = await resp.json();

        if (data.error) {
            card.querySelector('.result-body').innerHTML = `<pre style="color:var(--red)">${escapeHtml(data.error)}</pre>`;
            card.querySelector('.status-badge').className = 'status-badge error';
            card.querySelector('.status-badge').textContent = 'Error';
            if (navItem) { navItem.classList.remove('running'); navItem.classList.add('error'); }
        } else {
            card.querySelector('.result-body').innerHTML = formatResult(cmd, data);
            card.querySelector('.status-badge').textContent = 'Done';
            if (navItem) { navItem.classList.remove('running'); navItem.classList.add('done'); }
        }
        card.querySelector('.result-header h3').innerHTML = cmd;
        resultHistory.push({ cmd, data, time: new Date() });
    } catch (e) {
        card.querySelector('.result-body').innerHTML = `<pre style="color:var(--red)">Failed: ${escapeHtml(e.message)}</pre>`;
        card.querySelector('.status-badge').className = 'status-badge error';
        card.querySelector('.status-badge').textContent = 'Failed';
        if (navItem) { navItem.classList.remove('running'); navItem.classList.add('error'); }
    }

    setTimeout(() => { if (navItem) navItem.classList.remove('running'); }, 2000);
}

function formatResult(cmd, data) {
    if (typeof data === 'string') return `<pre>${escapeHtml(data)}</pre>`;
    if (data.output) return `<pre>${escapeHtml(typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2))}</pre>`;
    if (Array.isArray(data)) {
        if (data.length === 0) return '<pre>No results found.</pre>';
        return `<pre>${escapeHtml(data.join('\n'))}</pre>`;
    }
    if (typeof data === 'object') {
        const entries = Object.entries(data);
        if (entries.length === 0) return '<pre>No results found.</pre>';
        let html = '<div class="data-grid">';
        for (const [key, val] of entries) {
            const display = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
            html += `<div class="data-item"><div class="label">${escapeHtml(key)}</div><div class="value">${escapeHtml(display)}</div></div>`;
        }
        return html + '</div>';
    }
    return `<pre>${escapeHtml(String(data))}</pre>`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showHelp() {
    document.getElementById('content').innerHTML = `
        <div class="result-card">
            <div class="result-header"><h3>Connection Help</h3></div>
            <div class="result-body">
                <div class="data-grid">
                    <div class="data-item">
                        <div class="label">Problem</div>
                        <div class="value">GitHub Pages (HTTPS) cannot connect to your local HTTP server</div>
                    </div>
                    <div class="data-item">
                        <div class="label">Solution 1 — ngrok</div>
                        <div class="value">Run: <code>ngrok http 8000</code> then paste the HTTPS URL</div>
                    </div>
                    <div class="data-item">
                        <div class="label">Solution 2 — cloudflared</div>
                        <div class="value">Run: <code>cloudflared tunnel --url http://localhost:8000</code></div>
                    </div>
                    <div class="data-item">
                        <div class="label">Solution 3 — Run locally</div>
                        <div class="value">Download index.html, style.css, app.js and open in browser</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function exportResults() {
    if (resultHistory.length === 0) return showToast('No results to export', 'error');
    const blob = new Blob([JSON.stringify(resultHistory, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `osintgram-results-${target || 'export'}.json`;
    a.click();
    showToast('Results exported', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
    const savedUrl = localStorage.getItem('osintgram_server');
    if (savedUrl) document.getElementById('serverUrl').value = savedUrl;
    document.getElementById('serverUrl').addEventListener('change', (e) => {
        localStorage.setItem('osintgram_server', e.target.value);
    });
});
