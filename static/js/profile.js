// static/js/profile.js

console.log("profile.js لود شد");

// تابع کپی URL (همون قبلی که کار می‌کرد)
function initProfileCopy() {
    const urlBox = document.getElementById("urlBox");
    if (!urlBox) return;

    const urlTextEl = urlBox.querySelector(".url-text");
    if (!urlTextEl) return;

    const textToCopy = urlTextEl.textContent.trim();
    if (!textToCopy || textToCopy === "-" || textToCopy === "") return;

    const copyBtn = urlBox.querySelector(".copy-btn");

    async function doCopy(e) {
        if (e && e.target.closest(".copy-btn")) {
            e.stopPropagation();
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                // fallback برای HTTP
                const textarea = document.createElement("textarea");
                textarea.value = textToCopy;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            urlBox.classList.add("copied");
            setTimeout(() => urlBox.classList.remove("copied"), 2000);
        } catch (err) {
            prompt("لطفاً دستی کپی کنید:", textToCopy);
        }
    }

    urlBox.onclick = null;
    if (copyBtn) copyBtn.replaceWith(copyBtn.cloneNode(true));

    urlBox.addEventListener("click", doCopy);
    urlBox.querySelector(".copy-btn")?.addEventListener("click", doCopy);
}

// تابع ویرایش پروفایل
function initProfileEdit() {
    const editBtn = document.getElementById("editBtn");
    const saveBtn = document.getElementById("saveBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const inputs = document.querySelectorAll(".editable-input");

    if (!editBtn || !saveBtn || !cancelBtn || inputs.length === 0) {
        console.log("یکی از المنت‌های ویرایش پیدا نشد:", { editBtn, saveBtn, cancelBtn, inputs });
        return;
    }

    let original = {};

    editBtn.addEventListener("click", () => {
        console.log("دکمه ویرایش کلیک شد");
        inputs.forEach(inp => {
            original[inp.name] = inp.value;
            inp.removeAttribute("readonly");
        });
        editBtn.style.display = "none";
        saveBtn.style.display = "inline-flex";
        cancelBtn.style.display = "inline-flex";
        inputs[0].focus();
    });

    cancelBtn.addEventListener("click", () => {
        inputs.forEach(inp => {
            inp.value = original[inp.name] || "";
            inp.setAttribute("readonly", "");
        });
        saveBtn.style.display = "none";
        cancelBtn.style.display = "none";
        editBtn.style.display = "inline-flex";
    });

    saveBtn.addEventListener("click", () => {
        alert("ذخیره شد! (فعلاً فقط تست — بعداً به سرور وصل می‌کنیم)");
        inputs.forEach(inp => inp.setAttribute("readonly", ""));
        saveBtn.style.display = "none";
        cancelBtn.style.display = "none";
        editBtn.style.display = "inline-flex";
    });
}

// اجرا فقط وقتی محتوا لود شد
function runProfileScripts() {
    console.log("اجرای اسکریپت‌های پروفایل...");
    initProfileCopy();
    initProfileEdit();
}

// این دو خط حیاتی هستن
document.addEventListener("pageContentLoaded", runProfileScripts);
document.addEventListener("DOMContentLoaded", runProfileScripts);

// بک‌آپ نهایی (در صورت نیاز)
setTimeout(runProfileScripts, 500);

function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; top: 120px; left: 50%; transform: translateX(-50%);
        background: ${type === "success" ? "#10b981" : "#ef4444"};
        color: white; padding: 12px 24px; border-radius: 8px;
        z-index: 9999; font-size: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        animation: fadeInOut 3s forwards;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

const style = document.createElement("style");
style.textContent = `
@keyframes fadeInOut {
    0%   { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    15%  { opacity: 1; transform: translateX(-50%) translateY(0); }
    85%  { opacity: 1; transform: translateX(-50%) translateY(0); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
}`;
document.head.appendChild(style);

// آپلود آواتار
document.getElementById("avatarInput").addEventListener("change", async function () {
    if (!this.files[0]) return;

    const file = this.files[0];
    const formData = new FormData();
    formData.append("avatar", file);

    const img = document.getElementById("avatarImg");
    img.style.opacity = "0.4";

    try {
        const res = await fetch("/upload-avatar", { method: "POST", body: formData });
        
        if (res.ok) {
            // دریافت ext از سرور
            const data = await res.json();
            const timestamp = Date.now();
            const token = document.getElementById("inboxToken")?.dataset.token || ""; // اگر token وجود داشت
            let newSrc = "/static/uploads/avatars/default.jpg";
            if (data.ext && token) {
                newSrc = `/static/uploads/avatars/${token}.${data.ext}?v=${timestamp}`;
            } else {
                newSrc = img.src.split('?')[0] + "?v=" + timestamp;
            }
            img.src = newSrc;
            showToast("آواتار با موفقیت تغییر کرد!", "success");
        } else {
            showToast("خطا در بارگزاری", "failed");
        }
    } catch (e) {
        showToast("مشکل شبکه!", "failed");
    } finally {
        img.style.opacity = "1";
        this.value = "";
    }
});