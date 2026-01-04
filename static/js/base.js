const status = document.querySelector(".status");
const icon = document.querySelector(".status .icon");
const anime = document.querySelector(".status .anime");
const mainContent = document.querySelector("main");
const listItems = document.querySelectorAll(".list");

window.addEventListener('load', function() {
    const loader = document.querySelector('.loader');
    const content = document.querySelector('.content');

    if (!mainContent || !loader || !content) {
        return;
    }

    loader.style.display = 'none';
    content.style.display = 'block';

    const initialUrl = window.location.pathname === '/' ? '/home' : window.location.pathname;
    const activeItem = document.querySelector(`.list[data-url="${initialUrl}"]`);
    if (activeItem) {
        listItems.forEach((item) => item.classList.remove('active'));
        activeItem.classList.add('active');
    }
    loadPage(initialUrl);
});

function activeLink(event) {
    event.preventDefault();
    listItems.forEach((item) => item.classList.remove('active'));
    this.classList.add('active');
    const url = this.getAttribute('data-url');
    loadPage(url);
}

listItems.forEach((item) => item.addEventListener('click', activeLink));

function loadPage(url) {
    const loader = document.querySelector('.loader');
    const content = document.querySelector('.content');
    
    if (!loader || !content) {
        return;
    }

    loader.style.display = 'grid';
    content.style.display = 'none';

    fetch(url, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error();
        }
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        } else {
            return response.text();
        }
    })
    .then(data => {
        // === رفرش کامل صفحه ===
        if (data.refresh && data.redirect) {
            window.location.href = data.redirect;
            return;
        }

        if (typeof data === 'object' && data.status === 'unauthenticated') {
            window.location.href = data.redirect;
            return;
        }

        if (typeof data === 'object' && data.content) {
            mainContent.innerHTML = data.content;
            setTimeout(() => document.dispatchEvent(new Event("pageContentLoaded")), 10);
            console.log("محتوای صفحه بارگذاری شد → رویداد pageContentLoaded ارسال شد");
            if (data.initial_route) {
                window.initialRoute = data.initial_route;
            }

            document.querySelectorAll('link[data-page-specific]').forEach(link => link.remove());
            document.querySelectorAll('script[data-page-specific]').forEach(script => script.remove());

            data.css?.forEach(css => {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = css;
                link.setAttribute('data-page-specific', 'true');
                document.head.appendChild(link);
            });

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
            }, 100);
        } else {
            mainContent.innerHTML = data;
        }
        history.pushState({ url: url }, '', url);
        loader.style.display = 'none';
        content.style.display = 'block';
    })
    .catch(error => {
        mainContent.innerHTML = '<p>خطا در بارگذاری محتوا. لطفاً دوباره تلاش کنید.</p>';
        loader.style.display = 'none';
        content.style.display = 'block';
    });
}

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.url) {
        const url = event.state.url;
        const activeItem = document.querySelector(`.list[data-url="${url}"]`);
        if (activeItem) {
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

// add serviceWorker to site
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('✅ Service Worker ثبت شد با scope:', reg.scope);
      })
      .catch(err => {
        console.error('❌ ثبت Service Worker با خطا مواجه شد:', err);
      });
  });
}