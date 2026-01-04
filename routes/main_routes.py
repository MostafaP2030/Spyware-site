from flask import (
    Blueprint, render_template, jsonify, request, session,
    send_from_directory, redirect, url_for, current_app, flash
)
from ..models import User, Profile, db
from werkzeug.utils import secure_filename
from PIL import Image
import os
import time     

# تنظیمات آپلود
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 مگابایت (اختیاری برای امنیت بیشتر)

main_bp = Blueprint('main', __name__, template_folder='templates')


# ------------------------------------------------------------------
# توابع کمکی
# ------------------------------------------------------------------
def get_current_user():
    """برمی‌گرداند User فعلی یا None"""
    user_id = session.get('user_id')
    token = session.get('session_token')

    if not user_id or not token:
        return None

    user = User.query.get(user_id)
    if user and user.session_token == token:
        return user
    return None


def is_valid_image(file_stream):
    """بررسی می‌کنه که فایل واقعاً یه تصویر معتبر باشه (با Pillow)"""
    try:
        img = Image.open(file_stream)
        img.verify()                 # مهم‌ترین خط — فایل خراب رو تشخیص میده
        file_stream.seek(0)
        return True
    except Exception:
        file_stream.seek(0)
        return False


# ------------------------------------------------------------------
# Middleware — احراز هویت برای همه روت‌ها
# ------------------------------------------------------------------
@main_bp.before_request
def require_login():
    # 1. لیست سفید برای فایل‌های استاتیک و سرویس‌ورکر
    if request.endpoint in ['static', 'main.service_worker', 'main.ping', 'main.upload_avatar']:
        return
    
    # 2. اضافه شده: تمام درخواست‌هایی که به /api/ می‌روند را بدون لاگین قبول کن
    # (چون این درخواست‌ها در تابع خودشان توکن را چک می‌کنند)
    if request.path.startswith('/api/'):
        return

    # 3. بررسی لاگین برای سایر صفحات
    if not get_current_user():
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'refresh': True, 'redirect': '/form'}), 200
        return redirect('/form')

# ------------------------------------------------------------------
# روت‌های اصلی
# ------------------------------------------------------------------
@main_bp.route('/')
def index():
    user = get_current_user()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'content': render_template('home.html', user=user),
            'css': ['/static/css/home.css'],
            'js': ['/static/js/home.js']
        })
    return render_template('base.html')


@main_bp.route('/home')
def home():
    user = get_current_user()
    
    system_info = {}
    if user and user.profile and user.profile.main_info:
        system_info = user.profile.main_info

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'content': render_template('home.html', user=user, system_info=system_info),
            'css': ['/static/css/home.css'],
            'js': ['/static/js/home.js']
        })
    return render_template('base.html')



@main_bp.route('/save-system-info', methods=['POST'])
def save_system_info():
    user = get_current_user()
    if not user or not user.profile:
        return jsonify({"success": False}), 401

    data = request.get_json(silent=True) or {}
    key = data.get('key')
    value = str(data.get('value', '')).strip()

    if key not in ['os', 'cpu', 'username', 'pc_name'] or not value:
        return jsonify({"success": False}), 400

    profile = user.profile

    if profile.main_info is None:
        profile.main_info = {}

    profile.main_info[key] = value
    
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(profile, 'main_info')

    db.session.commit()

    return jsonify({"success": True})

@main_bp.route('/profile')
def profile():
    user = get_current_user()
    if not user:
        return redirect('/form')

    profile = Profile.query.filter_by(user_id=user.id).first()
    if not profile:
        return redirect('/form')

    url = f"http://127.0.0.1:5000/api/user/{profile.inbox_token}/inbox"

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'content': render_template(
                'profile.html',
                url=url,
                fullname = profile.fullname,
                username=user.username,
                password=user.password,
                email=profile.email,
                profile=profile  # برای دسترسی به inbox_token در JS
            ),
            'css': ['/static/css/profile.css'],
            'js': ['/static/js/profile.js']
        })
    return render_template('base.html')


@main_bp.route('/gallery')
def gallery():
    user = get_current_user()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'content': render_template('gallery.html', user=user),
            'css': ['/static/css/gallery.css'],
            'js': ['/static/js/gallery.js']
        })
    return render_template('base.html')

@main_bp.route('/get-latest-image')
def get_latest_image():
    user = get_current_user()
    if not user or not user.profile:
        return jsonify({'exists': False}), 401
    
    token = user.profile.inbox_token
    gallery_dir = os.path.join(current_app.static_folder, 'uploads', 'gallery', token)

    if os.path.exists(gallery_dir):
        files = os.listdir(gallery_dir)
        if files:
            filename = files[0]
            file_path = os.path.join(gallery_dir, filename)
            
            # دریافت زمان آخرین تغییر فایل
            mtime = os.path.getmtime(file_path)
            # محاسبه اختلاف زمانی با لحظه فعلی (به ثانیه)
            age = time.time() - mtime
            
            return jsonify({
                'exists': True,
                'url': f'/static/uploads/gallery/{token}/{filename}',
                'age': age  # ارسال سن فایل به ثانیه
            })
            
    return jsonify({'exists': False})

@main_bp.route('/api/user/<token>/gallery', methods=['POST'])
def receive_gallery_image(token):
    # ۱. احراز هویت با توکن
    profile = Profile.query.filter_by(inbox_token=token).first()
    if not profile:
        return jsonify({'error': 'Invalid token'}), 404

    # ۲. بررسی فایل
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    # ۳. مسیر پوشه گالری کاربر
    gallery_dir = os.path.join(current_app.static_folder, 'uploads', 'gallery', token)
    
    # اگر پوشه نبود، بساز
    if not os.path.exists(gallery_dir):
        os.makedirs(gallery_dir)
    else:
        # ۴. پاک کردن تمام عکس‌های قبلی (نکته کلیدی درخواست شما)
        for filename in os.listdir(gallery_dir):
            file_path = os.path.join(gallery_dir, filename)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)
            except Exception as e:
                print(f"Error deleting file: {e}")

    # ۵. ذخیره فایل جدید
    filename = secure_filename(file.filename)
    save_path = os.path.join(gallery_dir, filename)
    file.save(save_path)
    
    return jsonify({'status': 'success', 'message': 'Image updated'}), 200

@main_bp.route('/setting')
def setting():
    user = get_current_user()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'content': render_template('setting.html', user=user),
            'css': ['/static/css/setting.css'],
            'js': ['/static/js/setting.js']
        })
    return render_template('base.html')


# ------------------------------------------------------------------
# آپلود آواتار — مخصوص درخواست‌های AJAX (بدون رفرش)
# ------------------------------------------------------------------
@main_bp.route('/upload-avatar', methods=['POST'])
def upload_avatar():

    # 1. بررسی وجود فایل
    if 'avatar' not in request.files:
        return jsonify({"success": False, "message": "فایلی انتخاب نشده"}), 400

    file = request.files['avatar']
    if file.filename == '':
        return jsonify({"success": False, "message": "فایلی انتخاب نشده"}), 400

    # 2. بررسی پسوند
    if '.' not in file.filename:
        return jsonify({"success": False, "message": "فایل باید پسوند داشته باشد"}), 400

    ext = file.filename.rsplit('.', 1)[1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"success": False, "message": "فرمت مجاز نیست (png, jpg, jpeg, webp, gif)"}), 400

    # 3. بررسی واقعی بودن تصویر
    file.stream.seek(0)
    if not is_valid_image(file.stream):
        return jsonify({"success": False, "message": "فایل تصویر معتبری نیست"}), 400
    file.stream.seek(0)

    # 4. احراز هویت کاربر
    user = get_current_user()
    if not user or not user.profile:
        return jsonify({"success": False, "message": "کاربر معتبر نیست"}), 401

    profile = user.profile

    # 5. ساخت مسیر و نام فایل
    filename = f"{profile.inbox_token}.{ext}"
    filepath = os.path.join(current_app.static_folder, 'uploads', 'avatars', filename)

    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    # 6. حذف عکس قبلی (اگر وجود داشت)
    if profile.avatar and profile.avatar != 'default.jpg' and len(profile.avatar) <= 6:
        old_ext = profile.avatar
        old_path = os.path.join(current_app.static_folder, 'uploads', 'avatars', f"{profile.inbox_token}.{old_ext}")
        if os.path.exists(old_path):
            os.remove(old_path)

    # 7. ذخیره و بهینه‌سازی تصویر
    try:
        image = Image.open(file.stream)
        image.thumbnail((400, 400))  # حداکثر 400×400
        image.save(filepath, optimize=True, quality=88)
    except Exception as e:
        print("خطا در ذخیره تصویر:", e)
        return jsonify({"success": False, "message": "خطا در پردازش تصویر"}), 500

    # 8. به‌روزرسانی دیتابیس (فقط پسوند ذخیره می‌شه)
    profile.avatar = ext
    db.session.commit()

    print("[Avatar] آواتار با موفقیت آپلود شد →", filename)
    return jsonify({
        "success": True,
        "message": "آواتار با موفقیت تغییر کرد",
        "ext": ext
    }), 200

# main_routes.py

COMMANDS_LIST = [
    # --- NirCmd Commands (Shortened) ---
    "mutesysvolume 1",       # قطع صدا (Mute)
    "mutesysvolume 0",       # وصل صدا (Unmute)
    "mutesysvolume 2",       # تغییر وضعیت صدا (Toggle)
    "setsysvolume 65535",    # صدای ۱۰۰ درصد
    "setsysvolume 32768",    # صدای ۵۰ درصد
    "changesysvolume 5000",  # افزایش جزئی صدا
    "changesysvolume -5000", # کاهش جزئی صدا
    
    "monitor off",           # خاموش کردن مانیتور
    "monitor on",            # روشن کردن مانیتور
    "screensaver",           # اجرای اسکرین‌سیور
    "standby",               # حالت Sleep
    "hibernate",             # حالت Hibernate
    
    "exitwin logoff",        # خروج از حساب کاربری
    "exitwin reboot",        # ریستارت فوری
    "exitwin poweroff",      # خاموش کردن فوری
    
    "win min alltop",        # مینیمایز کردن تمام پنجره‌ها
    "win max alltop",        # ماکسیمایز کردن تمام پنجره‌ها
    "killprocess chrome.exe", # بستن اجباری کروم
    
    "beep 500 1000",         # پخش صدای بوق
    "cdrom open",            # باز کردن درایو نوری
    "cdrom close",           # بستن درایو نوری
    "emptybin",              # خالی کردن سطل زباله
    "savescreenshot screen.png" # اسکرین‌شات
]

@main_bp.route('/suggest-command', methods=['GET'])
def suggest_command():
    query = request.args.get('q', '').lower()
    
    if not query:
        return jsonify({'suggestion': ''})

    # پیدا کردن اولین دستوری که با متن کاربر شروع می‌شود
    match = next((cmd for cmd in COMMANDS_LIST if cmd.lower().startswith(query)), None)
    
    return jsonify({'suggestion': match if match else ''})


@main_bp.route('/change-profile', methods=['POST'])
def change_profile():
    user = get_current_user()
    if not user:
        return jsonify({"success": False, "message": "کاربر لاگین نیست"}), 401

    data = request.get_json()
    if not data:
        return jsonify({"success": False, "message": "داده‌ای ارسال نشده است"}), 400

    # استخراج مقادیر
    new_fullname = data.get('fullname', '').strip()
    new_username = data.get('username', '').strip()
    new_password = data.get('password', '').strip()
    new_email = data.get('email', '').strip()

    # اعتبارسنجی اولیه
    if not new_username:
        return jsonify({"success": False, "message": "نام کاربری نمی‌تواند خالی باشد"}), 400

    # بررسی تکراری نبودن نام کاربری
    if new_username != user.username:
        exists = User.query.filter_by(username=new_username).first()
        if exists:
            return jsonify({"success": False, "message": "این نام کاربری توسط شخص دیگری رزرو شده است"}), 400

    try:
        # ۱. به‌روزرسانی جدول User
        user.username = new_username
        if new_password: # تغییر پسورد فقط در صورت پر بودن فیلد
            user.password = new_password
        
        # ۲. به‌روزرسانی جدول Profile
        if user.profile:
            user.profile.fullname = new_fullname
            user.profile.email = new_email
        
        db.session.commit()
        return jsonify({"success": True, "message": "تغییرات با موفقیت ذخیره شد"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Update Error: {e}")
        return jsonify({"success": False, "message": "خطا در برقراری ارتباط با پایگاه داده"}), 500
    
# ------------------------------------------------------------------
# فایل‌های استاتیک
# ------------------------------------------------------------------

@main_bp.route('/sw.js')
def serve_sw():
    return send_from_directory('static', 'sw.js', mimetype='application/javascript')

@main_bp.route('/ping')
def ping():
    return "ok", 200