from flask import Blueprint, jsonify, request, session, Response, render_template, redirect
from ..models import User, Profile, db
terminal_bp = Blueprint('terminal', __name__)

def get_current_user():
    user_id = session.get('user_id')
    token = session.get('session_token')
    
    if not user_id or not token:
        return None
    
    user = User.query.get(user_id)
    if user and user.session_token == token:
        return user
    return None

@terminal_bp.route('/terminal')
def terminal():
    user = get_current_user()
    if not user:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'refresh': True, 'redirect': '/form'}), 200
        return redirect('/form')

    profile = Profile.query.filter_by(user_id=user.id).first()
    if not profile:
        profile = Profile(user_id=user.id)
        db.session.add(profile)
        db.session.commit()

    
    current_path = (profile.current_directory or "C:\\User").rstrip('\\') + "\\>"
    print("Current path in terminal:", current_path);
    
    template_content = render_template('terminal.html', profile=profile, current_path="current_path_1")

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({
            'content': template_content,
            'css': ['/static/css/terminal.css'],
        })

    # رفرش کامل صفحه (F5)
    current_path = current_path.replace("\\", "\\\\");
    return render_template('base.html',
                           title="Terminal",
                           content=template_content,
                           initial_route=current_path)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'refresh': True, 'redirect': '/form'}), 200
    return redirect('/form')

@terminal_bp.route('/save-command', methods=['POST'])
def save_command():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    command_type = data.get('type')
    command = data.get('command', '').strip()

    if command_type not in ['cmd', 'ps'] or not command:
        return jsonify({'error': 'Invalid data'}), 400

    profile = Profile.query.filter_by(user_id=user.id).first()
    if not profile:
        profile = Profile(user_id=user.id)
        db.session.add(profile)

    # --- فقط آخرین دستور کاربر (اما همه دستورات در تاریخچه می‌مونن) ---
    # پیدا کردن بالاترین id
    max_id = max((msg.get('id', -1) for msg in (profile.inbox or [])), default=-1)
    # max_id = profile.last_seen_inbox_id
    new_id = max_id + 1

    if command_type == 'ps' and command == 'pwd':
        command_type = 'cmd'
        command = 'cd'

    profile.inbox = (profile.inbox or []) + [{
        'id': new_id,
        'type': command_type,
        'msg': command,
        'info': ""
    }]

    db.session.commit()

    return jsonify({
        "status": "success",
        "id": new_id,
        "type": command_type
    })

@terminal_bp.route('/last-commands')
def get_last_commands():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    
    profile = Profile.query.filter_by(user_id=user.id).first()
    
    if profile and profile.last_commands:
        # ذخیره مقادیر فعلی برای ارسال به کلاینت
        current_commands = {
            'cmd': profile.last_commands.get('cmd', ''),
            'powershell': profile.last_commands.get('powershell', '')
        }
        
        # خالی کردن فیلد بعد از خواندن
        profile.last_commands = {'cmd': '', 'powershell': ''}
        db.session.commit()
        
        return jsonify(current_commands)
    
    # اگر پروفایلی نبود یا خالی بود
    return jsonify({'cmd': '', 'powershell': ''})

@terminal_bp.route('/api/user/<token>/inbox', methods=['GET', 'POST'])
def inbox_send(token):
    profile = Profile.query.filter_by(inbox_token=token).first()
    if not profile:
        return 'Invalid token', 404

    if request.method == 'POST':
        data = request.get_json()
        msg_type = data.get('type')
        msg_id = data.get('id')
        msg_info = data.get('info')

        try:
            msg_id = int(msg_id) if msg_id is not None else None
        except (ValueError, TypeError):
            msg_id = None

        # اطمینان از اینکه inbox لیست است
        if profile.inbox is None:
            profile.inbox = []

        message_updated = False
        for msg in profile.inbox:
            if msg.get('id') == msg_id and msg.get('type') == msg_type:
                if 'info' not in msg or not msg['info']:
                    msg['info'] = msg_info or ""
                    message_updated = True
                    break

        if message_updated:
            # علامت‌گذاری فیلد inbox به عنوان تغییر یافته
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(profile, 'inbox')
            
            db.session.commit()
            print("Changes committed successfully")

            # اگر info شامل درایو و بک‌اسلش باشه → مسیر جدیده
            info_text = msg_info.strip() if msg_info else ""
            if msg.get('type') == 'cmd' and len(info_text) > 2 and info_text[1] == ':' and '\\' in info_text and msg.get('msg', '').startswith('cd'):  
                profile.current_directory = info_text.rstrip('\\') + '\\'  # نرمال‌سازی
                print(f"[+] Current directory updated: {profile.current_directory}")
                db.session.commit()
            print("Current directory check : ", profile.current_directory);

        return '', 204
    else:
        return jsonify({'message': 'GET method not implemented'}), 200

@terminal_bp.route('/api/user/<token>/inbox/new')
def inbox_new_messages(token):
    profile = Profile.query.filter_by(inbox_token=token).first()
    print("last id : ", profile.last_seen_inbox_id)
    if not profile:
        return 'Invalid token', 404

    if not profile.inbox:
        return jsonify({}), 200

    # فقط دستورات کاربر (بدون info)
    new_commands = [
        msg for msg in profile.inbox
        if msg.get('type') in ['cmd', 'ps'] 
        and not msg.get('info')  # فقط پیام‌های بدون info = کاربر
        and msg.get('id', -1) > (profile.last_seen_inbox_id or -1)
    ]

    if not new_commands:
        return jsonify({}), 200

    last_command = max(new_commands, key=lambda x: x['id'])
    profile.last_seen_inbox_id = last_command['id']
    print("last command id: -------------      ", last_command['id'])
    db.session.commit()

    return jsonify({
        "terminal": last_command['type'],
        "command": last_command['msg'],
        "id": last_command['id']
    }), 200

@terminal_bp.route('/api/user/<token>/inbox/page')
def inbox_page(token):
    profile = Profile.query.filter_by(inbox_token=token).first()
    if not profile:
        return render_template('error.html', message="Invalid token"), 404

    messages = profile.inbox or []
    
    # تبدیل \\n به \n قبل از نمایش
    processed_messages = []
    for msg in messages:
        if isinstance(msg, dict) and 'info' in msg and msg['info']:
            msg = msg.copy()
            msg['info'] = msg['info']
        processed_messages.append(msg)

    return render_template('inbox.html', messages=reversed(processed_messages), token=token)

# terminal_routes.py
@terminal_bp.route('/get-command-info/<int:command_id>')
def get_command_info(command_id):
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401

    profile = Profile.query.filter_by(user_id=user.id).first()
    if not profile or not profile.inbox:
        return jsonify({'info': ''}), 200

    for msg in profile.inbox:
        if msg.get('id') == command_id and msg.get('type') in ['cmd', 'ps']:
            info = msg.get('info', '').strip()
            return jsonify({'info': info}), 200

    return jsonify({'info': ''}), 200

@terminal_bp.route('/check-connection')
def check_connection():
    return Response(status=200)