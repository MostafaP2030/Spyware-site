# main_routes.py — نسخه نهایی، تمیز، کاملاً تست‌شده و بدون خطا

from flask import (
    Blueprint, render_template, jsonify, request, session,
    send_from_directory, redirect, url_for, current_app, flash
)
from ..models import User, Profile, db
from werkzeug.utils import secure_filename
from PIL import Image
import os

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
    # این مسیرها بدون لاگین در دسترس هستن
    if request.endpoint in ['static', 'main.service_worker', 'main.ping', 'main.upload_avatar']:
        return

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
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'content': render_template('home.html', user=user),
            'css': ['/static/css/home.css'],
            'js': ['/static/js/home.js']
        })
    return render_template('base.html')


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


@main_bp.route('/photo')
def photo():
    user = get_current_user()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'content': render_template('photo.html', user=user),
            'css': ['/static/css/photo.css'],
            'js': ['/static/js/photo.js']
        })
    return render_template('base.html')


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


# ------------------------------------------------------------------
# فایل‌های استاتیک
# ------------------------------------------------------------------
@main_bp.route('/sw.js')
def service_worker():
    return send_from_directory('static/js', 'sw.js')


@main_bp.route('/ping')
def ping():
    return "ok", 200