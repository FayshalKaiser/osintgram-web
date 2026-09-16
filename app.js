let serverUrl = '';
let connected = false;
let target = '';
let resultHistory = [];

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
        const resp = await fetch(`${serverUrl}/`, { method: 'GET', mode: 'cors' });
        if (resp.ok || resp.status === 200 || resp.status === 404) {
            connected = true;
            statusEl.innerHTML = '<span class="dot dot-green"></span> Connected';
            showToast('Connected to server', 'success');
        } else {
            throw new Error(`HTTP ${resp.status}`);
        }
    } catch (e) {
        connected = false;
        statusEl.innerHTML = '<span class="dot dot-red"></span> Connection failed';
        showToast('Cannot reach server. Make sure Osintgram is running.', 'error');
    }
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
    const cardId = `result-${cmd}-${Date.now()}`;

    const card = document.createElement('div');
    card.className = 'result-card';
    card.id = cardId;
    card.innerHTML = `
        <div class="result-header">
            <h3>
                <span class="loading-spinner"></span>
                ${cmd}
            </h3>
            <span class="status-badge">Running</span>
        </div>
        <div class="result-body">
            <pre>Executing ${cmd}...</pre>
        </div>
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
        const info = commandsNeedingInput[cmd];
        input = prompt(info.placeholder);
        if (input === null) {
            card.remove();
            if (navItem) navItem.classList.remove('running');
            return;
        }
    }

    try {
        let url = `${serverUrl}/api/${cmd}`;
        let options = { method: 'GET', mode: 'cors' };

        if (target) {
            url += `?target=${encodeURIComponent(target)}`;
        }

        if (input && commandsNeedingInput[cmd]) {
            const sep = url.includes('?') ? '&' : '?';
            url += `${sep}${commandsNeedingInput[cmd].param}=${encodeURIComponent(input)}`;
        }

        const resp = await fetch(url, options);
        const data = await resp.json();

        let bodyHtml = '';
        if (data.error) {
            bodyHtml = `<pre style="color: var(--red)">${escapeHtml(data.error)}</pre>`;
            card.querySelector('.result-header h3').innerHTML = `${cmd}`;
            card.querySelector('.status-badge').className = 'status-badge error';
            card.querySelector('.status-badge').textContent = 'Error';
            if (navItem) {
                navItem.classList.remove('running');
                navItem.classList.add('error');
            }
        } else {
            bodyHtml = formatResult(cmd, data);
            card.querySelector('.result-header h3').innerHTML = `${cmd}`;
            card.querySelector('.status-badge').className = 'status-badge';
            card.querySelector('.status-badge').textContent = 'Done';
            if (navItem) {
                navItem.classList.remove('running');
                navItem.classList.add('done');
            }
        }

        card.querySelector('.result-body').innerHTML = bodyHtml;
        resultHistory.push({ cmd, data, time: new Date() });

    } catch (e) {
        card.querySelector('.result-body').innerHTML = `<pre style="color: var(--red)">Request failed: ${escapeHtml(e.message)}\n\nMake sure your Osintgram server is running and accessible.</pre>`;
        card.querySelector('.result-header h3').innerHTML = `${cmd}`;
        card.querySelector('.status-badge').className = 'status-badge error';
        card.querySelector('.status-badge').textContent = 'Failed';
        if (navItem) {
            navItem.classList.remove('running');
            navItem.classList.add('error');
        }
    }

    setTimeout(() => {
        if (navItem) navItem.classList.remove('running');
    }, 2000);
}

function formatResult(cmd, data) {
    if (typeof data === 'string') {
        return `<pre>${escapeHtml(data)}</pre>`;
    }

    if (data.output) {
        return `<pre>${escapeHtml(typeof data.output === 'string' ? data.output : JSON.stringify(data.output, null, 2))}</pre>`;
    }

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
        html += '</div>';
        return html;
    }

    return `<pre>${escapeHtml(String(data))}</pre>`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showHelp() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="result-card">
            <div class="result-header"><h3>Osintgram Commands</h3></div>
            <div class="result-body">
                <div class="data-grid">
                    <div class="data-item"><div class="label">Profile</div><div class="value">addrs, biography, followers, following, fulltitle, info, pronouns, private, pic, pp</div></div>
                    <div class="data-item"><div class="label">Network</div><div class="value">commenters, followersfollowing, followingsfollowers, mutual, tagged, tags, tocsv, wcommented, wtagged, wmentioned</div></div>
                    <div class="data-item"><div class="label">Content</div><div class="value">captions, comments, likes, mediadown, posers, search, smash, uploaded</div></div>
                    <div class="data-item"><div class="label">Search</div><div class="value">hashtag, place, propic</div></div>
                </div>
                <br><p style="color:var(--text-secondary);font-size:0.85rem">
                    Click any command in the sidebar to run it. Some commands will ask for input (hashtag, place, count, etc.)
                </p>
            </div>
        </div>
    `;
}

function exportResults() {
    if (resultHistory.length === 0) return showToast('No results to export', 'error');
    const json = JSON.stringify(resultHistory, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `osintgram-results-${target || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Results exported', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
    const savedUrl = localStorage.getItem('osintgram_server');
    if (savedUrl) document.getElementById('serverUrl').value = savedUrl;

    document.getElementById('serverUrl').addEventListener('change', (e) => {
        localStorage.setItem('osintgram_server', e.target.value);
    });
});
