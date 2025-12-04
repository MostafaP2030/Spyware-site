from flask_sqlalchemy import SQLAlchemy
import secrets
from sqlalchemy.ext.mutable import MutableList

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer , primary_key=True)
    username = db.Column(db.String(80))
    password = db.Column(db.String(80))
    session_token = db.Column(db.String(64), nullable=True, unique=True)

    profile = db.relationship('Profile', back_populates='user', uselist=False, cascade='all, delete')

class Profile(db.Model):
    __tablename__ = 'profiles'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100))
    avatar = db.Column(db.String(100))
    fullname = db.Column(db.String(100))
    last_commands = db.Column(db.JSON, default=dict)
    inbox_token = db.Column(db.String(32), unique=True, nullable=False, default=lambda: secrets.token_hex(16))
    inbox = db.Column(MutableList.as_mutable(db.JSON), default=list, nullable=False)
    last_seen_inbox_id = db.Column(db.Integer, default=-1)
    current_directory = db.Column(db.String(500), default='C:\\User')  # فیلد جدید برای ذخیره مسیر

    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True)
    user = db.relationship('User', back_populates='profile')
    
    def get_avatar_filename(self):
        """مثلاً: a1b2c3d4e5f6g7h8.jpg"""
        if not self.avatar or self.avatar == 'default.jpg':
            return 'default.jpg'
        # اگر فقط پسوند ذخیره کردی (مثل "jpg") → با inbox_token ترکیب میشه
        if len(self.avatar) <= 6:  # یعنی فقط پسوند ذخیره شده
            return f"{self.inbox_token}.{self.avatar}"
        return self.avatar  # اگر کل نام فایل ذخیره شده باشه

    def get_avatar_url(self):
        """آدرس کامل برای استفاده در HTML"""
        filename = self.get_avatar_filename()
        return f"/static/uploads/avatars/{filename}"
