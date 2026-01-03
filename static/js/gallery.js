{
const pendingCommands = new Map(); 

const power = document.getElementById("power");
const monitorDisplay = document.getElementById("monitorDisplay");
const screenImage = document.getElementById("screenImage");
const loadingText = document.getElementById("loadingText");

// حداکثر زمان مجاز برای قدیمی بودن عکس (مثلاً 5 ثانیه)
const MAX_LATENCY = 5; 
const MAX_WAITING = 15;
let state = "off"; // off | waiting_off | waiting_on | on
let bootTimer = null;
let imageInterval = null; // متغیر برای ذخیره تایمر آپدیت عکس
let startupTime = 0; // زمان روشن شدن سیستم


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

async function handleCommand(cmd, type) {
    const serverData = await sendCommandToServer(cmd, type);
    let commandId;
    if (serverData && serverData.status === "success") {
        commandId = serverData.id;
        waitForCommandResponse(commandId, type);
    }
}

async function waitForCommandResponse(commandId, type) {

    let attempts = 0;
    const maxAttempts = 10;
    let hasResponse = false;

    const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        pendingCommands.delete(commandId);
        if (!hasResponse) {
            // unlockAll();
            showNotification("Error: Disconnected", 'error');  // ← notification قرمز
            changeState('error');
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
                changeState('error');
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
                
                showNotification(info, 'success'); 
                changeState();
                
                clearInterval(intervalId);
                clearTimeout(timeoutId);
                pendingCommands.delete(commandId);
            }
        } catch (err) {
            console.warn(`Polling error for ID ${commandId}:`, err);
            changeState('error');
        }
    }, 1000);

    pendingCommands.set(commandId, { type, intervalId, timeoutId });
}


power.addEventListener("click", () => {

    
    
    // --- روشن کردن سیستم ---
    if (state === "off") {
        state = "waiting_off";
        power.classList.add("waiting", "locked");
        startupTime = Date.now();
        handleCommand("on","pic");
    }

    // --- خاموش کردن سیستم ---
    else if (state === "on") {
        state = "waiting_on";
        // power.classList.remove("on");
        power.classList.add("waiting", "locked");
        handleCommand("off","pic");
    }

});

// --- توابع کمکی ---

function startImageStream() {
    // بلافاصله یک بار اجرا کن تا کاربر 1.5 ثانیه منتظر نماند
    fetchAndShowImage();

    // تنظیم تایمر تکرار شونده
    imageInterval = setInterval(() => {
        fetchAndShowImage();
    }, 1500); // 1500 میلی‌ثانیه = 1.5 ثانیه

    const cleanupChecker = setInterval(() => {
        // چک می‌کنیم آیا المان power هنوز در صفحه هست؟
        const powerBtn = document.getElementById("power");
        
        if (!powerBtn) {
            // کاربر از صفحه گالری خارج شده است
            console.log("Gallery Closed. Cleaning up timers...");
            
            if (imageInterval) clearInterval(imageInterval);
            if (bootTimer) clearTimeout(bootTimer);
            
            // پاک کردن تایمرهای دستورات در انتظار
            pendingCommands.forEach(cmd => {
                clearInterval(cmd.intervalId);
                clearTimeout(cmd.timeoutId);
            });
            pendingCommands.clear();

            // در نهایت خود این چک‌کننده را خاموش می‌کنیم
            clearInterval(cleanupChecker);
        }
    }, 1000); // هر 1 ثانیه چک می‌کند
}

function stopImageStream() {
    if (imageInterval) {
        clearInterval(imageInterval);
        imageInterval = null;
    }
}

function updateStatusText(text) {
    loadingText.textContent = text;
    loadingText.style.display = 'block';
}

async function fetchAndShowImage() {
    try {
        const response = await fetch('/get-latest-image');
        const data = await response.json();

        // محاسبه اینکه آیا هنوز در زمان "راه‌اندازی اولیه" هستیم؟
        // (مثلاً تا 20 ثانیه اول به سیستم فرصت می‌دهیم)
        const isWarmingUp = (Date.now() - startupTime) > 20000; 

        if (data.exists) {
            // 1. بررسی برای خاموش کردن کامل (عکس خیلی قدیمی)
            if (data.age > MAX_WAITING && isWarmingUp) {
                
                // اگر زمان راه‌اندازی تمام شده و هنوز عکس قدیمی است، حالا خاموش کن
                clearTimeout(bootTimer); 
                stopImageStream();       
                
                power.classList.remove("on");
                monitorDisplay.classList.remove("active");
                
                screenImage.style.display = 'none';
                screenImage.src = '';
                
                state = "off";
                power.classList.add("off");
                return; 
            }

            // 2. بررسی برای پیام قطع اتصال (عکس کمی قدیمی)
            if (data.age > MAX_LATENCY) {
                screenImage.style.display = 'none';
                // در زمان وارم‌آپ ننویس Disconnected، بنویس Waiting
                updateStatusText("WAITING FOR SIGNAL...");
                return; 
            }

            // 3. حالت نرمال: عکس جدید و سالم
            const uniqueUrl = data.url + '?t=' + Date.now();

            const tempImg = new Image();
            tempImg.onload = () => {
                screenImage.src = uniqueUrl;
                screenImage.style.display = 'block';
                loadingText.style.display = 'none';
            };
            tempImg.onerror = () => {
                console.warn("Image load failed");
            };
            tempImg.src = uniqueUrl;

        } else {
            // اگر اصلا عکسی نبود
            screenImage.style.display = 'none';
            updateStatusText("WAITING FOR SIGNAL...");
        }

    } catch (error) {
        console.error("Connection Error:", error);
        screenImage.style.display = 'none';
        updateStatusText("CONNECTION ERROR");
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.classList.add('notification');
    notification.classList.add(type === 'success' ? 'success' : 'error');
    notification.textContent = message;

    document.body.appendChild(notification);
    notification.offsetHeight; 

    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
        notification.classList.add('hide');

        notification.addEventListener('transitionend', () => notification.remove(), { once: true });
    }, 2500);
}

function changeState(type = 'success')
{
    if (type == 'success')
    {
        if (state == 'waiting_off')
        {
            power.classList.remove("waiting", "locked");
            power.classList.add("on"); 
            state = "on";
            
            // نمایش مانیتور
            monitorDisplay.classList.add("active");
            updateStatusText("ESTABLISHING LINK...");

            // شروع چرخه دریافت تصاویر (هر 1.5 ثانیه)
            startImageStream();
        }
        else if (state == 'waiting_on')
        {
            power.classList.remove("waiting", "locked");

            clearTimeout(bootTimer); // اگر هنوز بوت نشده بود و کنسل شد
            stopImageStream();       // توقف دریافت عکس
            
            power.classList.remove("on");
            monitorDisplay.classList.remove("active");
            
            // ریست کردن مانیتور به حالت اولیه
            screenImage.style.display = 'none';
            screenImage.src = '';

            state = "off";
        }
    }
    else if (type == 'error')
    {
        if (state == 'waiting_off')
        {
            power.classList.remove("waiting", "locked");
            power.classList.add("off"); 
            state = "off";
        }
    }
}




}