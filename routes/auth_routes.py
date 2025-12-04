from flask import Blueprint, render_template, jsonify, request, redirect, url_for, session
from ..models import User, Profile, db
import uuid
import secrets
auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/form')
def form():
    return render_template('form.html')



@auth_bp.route('/signup', methods=['POST'])
def signup():
    username = request.form.get('username', 'no name')
    password = request.form.get('password', 'no password')
    email = request.form.get('email', 'no email')
    try:
        if User.query.filter_by(username= username).first():
            return jsonify({'error': 'Username already exists'}), 400

        newUser = User(username = username, password= password)

        db.session.add(newUser)
        db.session.flush()

        inbox_token = secrets.token_hex(16)
        newProfile = Profile(email = email, fullname= None, avatar=None, user_id = newUser.id, inbox_token=inbox_token)

        db.session.add(newProfile)

        db.session.commit()

        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
           return jsonify({'status': 'success', 'redirect': '/home'}), 200
        return redirect(url_for('main.index'))
    
    except Exception as ex:
        db.session.rollback()
        print("Signup error:", ex)
        return jsonify({"error": str(ex)}), 500
    

# ************************************************************************
@auth_bp.route('/login', methods=['POST'])
def login():

    username = request.form.get('username', 'no name')
    password = request.form.get('password', 'no password')

    try:
        user = User.query.filter_by(username=username).first()

        if not user:
            return jsonify({"error": "Username does not exist"}), 400

        if not user.password == password:
            return jsonify({"error": "Incorrect password"}), 401

        new_token = str(uuid.uuid4())
        user.session_token = new_token
        db.session.commit()

        # تنظیم اطلاعات در جلسه
        session['user_id'] = user.id 
        session['session_token'] = new_token

        session.permanent = True

        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'status': 'success', 'redirect': '/home'}), 200

        return redirect(url_for('main.index'))

    except Exception as ex:
        return jsonify({"error": str(ex)}), 500
    

#  ####################################################################3
@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'status': 'success', 'redirect': '/form'})
    return redirect(url_for('auth.form'))
