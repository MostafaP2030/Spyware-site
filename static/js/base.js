const status = document.querySelector(".status");
const icon = document.querySelector(".status .icon");
const anime = document.querySelector(".status .anime");
const mainContent = document.querySelector("main");
const listItems = document.querySelectorAll(".list");
let search;

window.addEventListener('load', function() {
    search = document.getElementById('search');
    const loader = document.querySelector('.loader');
    const content = document.querySelector('.content');

    if (!mainContent || !loader || !content) {
        return;
    }

    // تغییر: محتوا را بلافاصله نشان بده (چون نویگیشن داخلش است)
    loader.style.display = 'none';
    content.style.display = 'block'; 

    const initialUrl = window.location.pathname === '/' ? '/home' : window.location.pathname;
    
    // فعال‌سازی لینک مربوطه بدون رفرش (برای اینکه انیمیشن اولیه درست بایستد)
    const activeItem = document.querySelector(`.list[data-url="${initialUrl}"]`);
    if (activeItem) {
        listItems.forEach((item) => item.classList.remove('active'));
        activeItem.classList.add('active');
    }
    
    
    // اما برای هماهنگی History API:
    history.replaceState({ url: initialUrl }, '', initialUrl);
});

function activeLink(event) {
    event.preventDefault();
    
    // 1. تغییر کلاس Active (این خط انیمیشن CSS را فعال می‌کند)
    listItems.forEach((item) => item.classList.remove('active'));
    this.classList.add('active');
    
    // 2. شروع لود محتوا
    const url = this.getAttribute('data-url');
    loadPage(url);
}

listItems.forEach((item) => item.addEventListener('click', activeLink));

function loadPage(url) {
    const loader = document.querySelector('.loader');
    const content = document.querySelector('.content');
    
    if (!loader || !content) return;

    loader.style.display = 'grid';
    
    // محو کردن محتوا
    mainContent.style.opacity = '0';
    mainContent.style.transition = 'opacity 0.2s'; 
    mainContent.style.pointerEvents = 'none';

    fetch(url, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(response => {
        if (!response.ok) throw new Error();
        const contentType = response.headers.get('Content-Type');
        return (contentType && contentType.includes('application/json')) ? response.json() : response.text();
    })
    .then(async data => { // تابع async
        // هندل کردن ریدایرکت‌ها
        if (data.refresh && data.redirect) {
            window.location.href = data.redirect;
            return;
        }
        if (typeof data === 'object' && data.status === 'unauthenticated') {
            window.location.href = data.redirect;
            return;
        }
        if(search) {
            if(data.search) search.style.display = "flex";
            else search.style.display = "none";
        }

        // اگر دیتا فرمت استاندارد ما را دارد
        if (typeof data === 'object' && data.content) {
            
            // ============================================================
            // گام حیاتی: لود کردن CSS جدید **قبل** از تغییر HTML
            // ============================================================
            
            const cssPromises = [];
            
            // لیست CSSهای جدید
            if (data.css && data.css.length > 0) {
                data.css.forEach(cssUrl => {
                    // چک میکنیم اگر این CSS قبلا در صفحه هست، دوباره لود نکنیم
                    if (!document.querySelector(`link[href="${cssUrl}"]`)) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = cssUrl;
                        link.setAttribute('data-page-specific', 'true'); // علامت‌گذاری به عنوان جدید
                        
                        const p = new Promise((resolve) => {
                            link.onload = () => resolve();
                            link.onerror = () => resolve(); // خطا داد هم رد شو که گیر نکنه
                        });
                        
                        document.head.appendChild(link);
                        cssPromises.push(p);
                    }
                });
            }

            // یک تایم‌اوت 2 ثانیه‌ای هم میذاریم که اگر اینترنت قطع بود برنامه قفل نکنه
            if (cssPromises.length > 0) {
                const timeout = new Promise(r => setTimeout(r, 2000));
                await Promise.race([Promise.all(cssPromises), timeout]);
            }
            const notification = document.querySelector(".notification");
            if (notification) {
                notification.remove();
            }
            // 1. تغییر HTML
            mainContent.innerHTML = data.content;
            
            // 2. پاکسازی CSS و JS قدیمی
            const newCssList = data.css || [];
            
            document.querySelectorAll('link[data-page-specific]').forEach(link => {
                const href = link.getAttribute('href');                
                                
                let isNeeded = false;
                newCssList.forEach(newUrl => {
                    if (href.includes(newUrl)) isNeeded = true;
                });
                
                if (!isNeeded) {
                    link.remove();
                }
            });

            // حذف همه اسکریپت‌های قدیمی
            document.querySelectorAll('script[data-page-specific]').forEach(script => script.remove());


            // 3. اجرای تنظیمات اولیه
            if (data.initial_route) window.initialRoute = data.initial_route;
            setTimeout(() => document.dispatchEvent(new Event("pageContentLoaded")), 10);


            // 4. لود اسکریپت‌های جدید
            setTimeout(() => {
                data.js?.forEach(js => {
                    const script = document.createElement('script');
                    script.src = js;
                    script.async = true;
                    script.setAttribute('data-page-specific', 'true');
                    script.onload = () => {
                        if (js.includes('terminal.js') && window.initializeTerminals) {
                            window.initializeTerminals();
                        }
                    };
                    document.body.appendChild(script);
                });
            }, 50);

        } else {
            // حالت غیر JSON (متن خالی)
            mainContent.innerHTML = data;
        }

        history.pushState({ url: url }, '', url);
    })
    .catch(error => {
        console.error(error);
        mainContent.innerHTML = '<p style="text-align:center;color:white;">Error Loading Page</p>';
    })
    .finally(() => {
        // پایان کار: مخفی کردن لودر و نمایش محتوا
        loader.style.display = 'none';
        
        // با یک تاخیر بسیار جزئی (یک فریم) محتوا را ظاهر میکنیم
        requestAnimationFrame(() => {
            mainContent.style.opacity = '1';
            mainContent.style.pointerEvents = 'auto';
        });
    });
}

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.url) {
        const url = event.state.url;
        const activeItem = document.querySelector(`.list[data-url="${url}"]`);
        if (activeItem) {
            // تغییر کلاس active برای دکمه‌های Back/Forward
            listItems.forEach((item) => item.classList.remove('active'));
            activeItem.classList.add('active');
        }
        loadPage(url);
    }
});

function setStatus(isOnline) {
    if (status && icon && anime) {
        if (isOnline) {
            status.style.backgroundColor = "#c0ffcc";
            icon.style.backgroundColor = "#c0ffcc";
            icon.style.color = "#15ff00";
            anime.style.background = "repeating-conic-gradient(from var(--a), #29fd53 0%, #29fd53 5%, transparent 5%, transparent 40%, #29fd53 50%)";
        } else {
            status.style.backgroundColor = "#d3d3d3";
            icon.style.backgroundColor = "#d3d3d3";
            icon.style.color = "#4a4a4a";
            anime.style.background = "repeating-conic-gradient(from var(--a), #6b7280 0%, #6b7280 5%, transparent 5%, transparent 40%, #6b7280 50%)";
        }
    }
}

function updateStatus() {
    setStatus(navigator.onLine);
}
updateStatus();
window.addEventListener("online", updateStatus);
window.addEventListener("offline", updateStatus);

async function checkConnection() {
    try {
        const response = await fetch("/check-connection", { method: "HEAD", cache: "no-cache" });
        setStatus(response.ok);
    } catch {
        setStatus(false);
    }
}
setInterval(checkConnection, 3000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}