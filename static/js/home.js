{
const pendingCommands = new Map(); // <--- این خط را اضافه کنید
document.querySelector('.power-btn').onclick = function() {
    this.classList.toggle('on');
};

document.querySelector('.restart-btn').onclick = function() {
    this.querySelector('i').classList.add('spin');
    setTimeout(() => {
        this.querySelector('i').classList.remove('spin');
    }, 600);
};

let globalLock = false;
let globalLockTimer = null;
function lockAllFor(seconds = 10) {
    globalLock = true;
    
    const buttons = document.querySelectorAll('.send-btn, .speak-btn');

    buttons.forEach(btn => {
        // ریست کردن تایمر: اول کلاس را حذف و بلافاصله اضافه می‌کنیم
        btn.classList.remove('is-locked');
        void btn.offsetWidth; // این خط جادویی باعث ریست شدن انیمیشن CSS می‌شود
        btn.classList.add('is-locked');
    });

    if (globalLockTimer) clearTimeout(globalLockTimer);

    globalLockTimer = setTimeout(() => {
        globalLock = false;
        globalLockTimer = null;
        
        buttons.forEach(btn => btn.classList.remove('is-locked'));
    }, seconds * 1000);
}
function unlockAll() {
    globalLock = false;
    
    // متوقف کردن تایمر ۱۰ ثانیه‌ای (اگر هنوز تمام نشده باشد)
    if (globalLockTimer) {
        clearTimeout(globalLockTimer);
        globalLockTimer = null;
    }

    // حذف کلاس انیمیشن از دکمه‌ها برای ریست شدن ظاهر
    const buttons = document.querySelectorAll('.send-btn, .speak-btn');
    buttons.forEach(btn => btn.classList.remove('is-locked'));
}

const sendButton = document.querySelector(".send-btn");
const inputField = document.getElementById("show-send");

function sendCommand() {

    // ⛔ قفل سراسری
    if (globalLock) return;

    const command = inputField.value.trim();
    const type = "dll";

    if (!command) return;


    handleCommand(command, type, null);

    inputField.value = "";

    lockAllFor(10);

}

// click & entere for sendBox
sendButton.addEventListener("click", sendCommand);
inputField.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
        e.preventDefault();
        sendCommand();
    }
});

const infoContainer = document.querySelector('.info-container');

infoContainer.addEventListener('click', function(e) {
    const btn = e.target.closest('.retry-btn');
    if (!btn) return;

    const command = btn.dataset.command;
    const type = btn.dataset.type;
    const targetSpan = btn.closest('.info-box').querySelector('.information');

    if (command && type) {
        console.log(`Command sent: ${command}, Type: ${type}`);
        handleCommand(command, type, targetSpan);
    }
});

// انتخاب کانتینر اصلی دکمه‌ها
const buttonContainer = document.querySelector('.button-container');

buttonContainer.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn');
    if (!btn) return;

    const command = btn.dataset.command;
    const type = btn.dataset.type;

    if (command && type) {
        console.log(`Command sent: ${command}, Type: ${type}`);
        handleCommand(command, type, null);
    }
});

async function sendCommandToServer(cmd, type) {
    try {
        const response = await fetch('/save-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, command: cmd })
        });
        const data = await response.json();
        return data; 
    } catch (err) {
        console.error("Error saving command:", err);
        return null;
    }
}

async function handleCommand(cmd, type, targetSpan) {
    const serverData = await sendCommandToServer(cmd, type);
    let commandId;
    if (serverData && serverData.status === "success") {
        commandId = serverData.id;
        waitForCommandResponse(commandId, type, targetSpan);
    }
}

async function waitForCommandResponse(commandId, type, targetSpan) {

    if (targetSpan) {
        curInfo = targetSpan.textContent;
        targetSpan.innerHTML = '<span class="loaderInfo"></span>';    
    }


    let attempts = 0;
    const maxAttempts = 10;
    let hasResponse = false;

    const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        pendingCommands.delete(commandId);
        if (!hasResponse) {
            unlockAll();
            showNotification("Error: Disconnected", 'error');  // ← notification قرمز
            if(targetSpan)
                targetSpan.textContent = curInfo;
        }
    }, 10000);

    const intervalId = setInterval(async () => {
        attempts++;
        if (hasResponse || attempts > maxAttempts) {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            pendingCommands.delete(commandId);
            if (!hasResponse) {
                showNotification("Error: Timeout - No response", 'error');  // ← اگر attempts تموم شد
                if(targetSpan)
                        targetSpan.textContent = curInfo;
            }
            return;
        }

        try {
            const response = await fetch(`/get-command-info/${commandId}`);
            if (!response.ok) return;

            const data = await response.json();
            const info = data.info?.trim();

            if (info) {
                hasResponse = true;
                if (info.includes("The system cannot find the path specified.") ||
                    info.includes("Error ") && info.includes("Cannot change directory") ||
                    info.includes("<error>")) {
                    showNotification(info, 'error'); 
                    if(targetSpan)
                        targetSpan.textContent = curInfo;
                }
                else if(targetSpan)
                {
                    targetSpan.textContent = info;
                    showNotification("successfully", 'success'); 

                    const label = targetSpan.dataset.name;
                    let key = '';
                    if (label === 'os') key = 'os';
                    else if (label === 'cpu') key = 'cpu';
                    else if (label === 'username') key = 'username';
                    else if (label === 'pc_name') key = 'pc_name';

                    if (key) {
                        fetch('/save-system-info', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: key, value: info.trim() })
                        });
                    }
                }
                else
                {
                    showNotification(info, 'success'); 
                }
                
                clearInterval(intervalId);
                clearTimeout(timeoutId);
                pendingCommands.delete(commandId);
                unlockAll();
            }
        } catch (err) {
            console.warn(`Polling error for ID ${commandId}:`, err);
        }
    }, 1000);

    pendingCommands.set(commandId, { type, intervalId, timeoutId });  // outputLine رو حذف کردیم چون لازم نیست
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.classList.add('notification');
    notification.classList.add(type === 'success' ? 'success' : 'error');
    notification.textContent = message;

    document.body.appendChild(notification);
    notification.offsetHeight; // فورس reflow

    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
        notification.classList.add('hide');

        notification.addEventListener('transitionend', () => notification.remove(), { once: true });
    }, 2500);
}


// ==========================================
// GHOST TEXT AUTOCOMPLETE LOGIC (Case Insensitive Fix)
// ==========================================

const userShowInput = document.getElementById('show-send');
const ghostHintInput = document.getElementById('hint-send');

if (userShowInput && ghostHintInput) {
    
    // وقتی کاربر تایپ می‌کند
    userShowInput.addEventListener('input', function(e) {
        const query = this.value;

        // اگر متن خالی شد، پیشنهاد را پاک کن
        if (!query) {
            ghostHintInput.value = '';
            return;
        }

        // ارسال درخواست به سرور
        fetch(`/suggest-command?q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                const serverSuggestion = data.suggestion; // مثلاً "ipconfig"
                
                // بررسی تطابق (بدون حساسیت به حروف بزرگ و کوچک)
                if (serverSuggestion && serverSuggestion.toLowerCase().startsWith(query.toLowerCase())) {

                    //ترکیب رشته 
                    //قسمت اول چیزی که کاربر تایپ کرده و قسمت دوم ادامه پیشنهاد 
                    const part1 = query; // مثلاً "Ip"
                    const part2 = serverSuggestion.substring(query.length); // مثلاً "config"
                    
                    const mixedCaseSuggestion = part1 + part2; // نتیجه: "Ipconfig"
                
                    ghostHintInput.value = mixedCaseSuggestion;
                } else {
                    ghostHintInput.value = '';
                }
            })
            .catch(err => console.error(err));
    });

    // مدیریت دکمه Tab
    userShowInput.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            const currentHint = ghostHintInput.value;
            
            // اگر پیشنهادی وجود دارد
            if (currentHint) {
                e.preventDefault(); 
                this.value = currentHint; 
                ghostHintInput.value = ''; // پاک کردن شبح
            }
        }
    });
}

// ==========================================
// START SPEAK ... 
// ==========================================

const speakButton = document.querySelector('.speak-btn');
const inputSpeak = document.getElementById('speak');

speakButton.addEventListener("click", speakCommand);
inputSpeak.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
        e.preventDefault();
        speakCommand();
    }
});

function speakCommand()
{
    // ⛔ قفل سراسری
    if (globalLock) return;

    const command = inputSpeak.value.trim();
    const type = "say";

    if (!command) return;

    handleCommand(command, type, null);

    inputSpeak.value = "";

    lockAllFor(10);
}

const homeCleanup = setInterval(() => {
        if (!document.querySelector('.power-btn')) { // چک کردن وجود دکمه‌ای از صفحه home
            pendingCommands.forEach(cmd => {
                clearInterval(cmd.intervalId);
                clearTimeout(cmd.timeoutId);
            });
            pendingCommands.clear();
            clearInterval(homeCleanup);
        }
    }, 2000);

}