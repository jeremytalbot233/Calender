from flask import Flask, render_template, request, jsonify, session, redirect, url_for, make_response
from models import db, Event, Class, Theme, Note
import os
import hashlib
import hmac
import pyotp
import qrcode
import qrcode.image.svg
import io
import base64
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__)

uri = os.environ.get('DATABASE_URL', 'sqlite:///local.db')
if uri and uri.startswith('postgres://'):
    uri = uri.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
# Session never expires — user stays logged in until they log out
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=3650)

db.init_app(app)

DEFAULT_CLASSES = [
    {'name': 'S2 Digital Tech', 'color': 'rgb(100,160,190)', 'bg': 'rgb(173,216,230)', 'order': 0},
    {'name': 'S2 Game Design',  'color': 'rgb(150,110,150)', 'bg': 'rgb(216,191,216)', 'order': 1},
    {'name': 'S1 Digital Tech', 'color': 'rgb(200,120,50)',  'bg': 'rgb(255,204,153)', 'order': 2},
    {'name': 'S1 Game Design',  'color': 'rgb(150,110,150)', 'bg': 'rgb(216,191,216)', 'order': 3},
    {'name': 'Y9 Digital Tech', 'color': 'rgb(60,160,60)',   'bg': 'rgb(144,238,144)', 'order': 4},
    {'name': 'Y8 Digital Tech', 'color': 'rgb(200,100,120)', 'bg': 'rgb(255,182,193)', 'order': 5},
]

DEFAULT_THEME = {
    '--bg':           '#f4f1eb',
    '--surface':      '#fffef9',
    '--border':       '#ddd8cc',
    '--text':         '#1a1612',
    '--muted':        '#7a7060',
    '--font-body':    'DM Sans',
    '--font-mono':    'DM Mono',
    '--font-heading': 'DM Serif Display',
    'cal-year':       '2026',
    'cal-subtitle':   '2026 — All Due Dates',
    'term1-start':    '2026-01-27',
    'term1-end':      '2026-04-10',
    'term2-start':    '2026-04-27',
    'term2-end':      '2026-07-03',
    'term3-start':    '2026-07-20',
    'term3-end':      '2026-09-25',
    'term4-start':    '2026-10-12',
    'term4-end':      '2026-12-11',
}

with app.app_context():
    db.create_all()
    if Class.query.count() == 0:
        for c in DEFAULT_CLASSES:
            db.session.add(Class(**c))
        db.session.commit()
    for k, v in DEFAULT_THEME.items():
        if not Theme.query.filter_by(key=k).first():
            db.session.add(Theme(key=k, value=v))
    db.session.commit()


# ── Auth helpers ─────────────────────────────────────
def get_totp_secret():
    """Get TOTP secret from env. Generate one if not set (first run)."""
    return os.environ.get('TOTP_SECRET', '')

def hash_password(password):
    key = app.config['SECRET_KEY'].encode()
    return hmac.new(key, password.encode(), hashlib.sha256).hexdigest()

def check_password(password):
    plain = os.environ.get('APP_PASSWORD', '')
    if not plain:
        return False
    return hmac.compare_digest(hash_password(password), hash_password(plain))

def verify_totp(code):
    secret = get_totp_secret()
    if not secret:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('logged_in'):
            if request.is_json:
                return jsonify({'error': 'Unauthorised'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


# ── Auth routes ──────────────────────────────────────
@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('logged_in'):
        return redirect(url_for('index'))

    error = None
    if request.method == 'POST':
        password = request.form.get('password', '')
        if check_password(password):
            # Password correct — store in session and move to 2FA step
            session['pw_verified'] = True
            return redirect(url_for('verify_2fa'))
        else:
            error = 'Incorrect password. Please try again.'

    return render_template('login.html', error=error)


@app.route('/verify', methods=['GET', 'POST'])
def verify_2fa():
    # Must have passed password step first
    if not session.get('pw_verified'):
        return redirect(url_for('login'))
    if session.get('logged_in'):
        return redirect(url_for('index'))

    totp_secret = get_totp_secret()

    # If no TOTP secret set yet — show setup page
    if not totp_secret:
        return redirect(url_for('setup_2fa'))

    error = None
    if request.method == 'POST':
        code = request.form.get('code', '').replace(' ', '')
        if verify_totp(code):
            session.permanent = True
            session['logged_in'] = True
            session.pop('pw_verified', None)
            return redirect(url_for('index'))
        else:
            error = 'Invalid code. Please try again.'

    return render_template('verify.html', error=error)


@app.route('/setup-2fa')
def setup_2fa():
    """Show QR code for first-time TOTP setup."""
    if not session.get('pw_verified'):
        return redirect(url_for('login'))

    totp_secret = get_totp_secret()
    if not totp_secret:
        # Generate a new secret to display — user must set it as env var
        totp_secret = pyotp.random_base32()

    totp = pyotp.TOTP(totp_secret)
    uri  = totp.provisioning_uri(name='Class Calendar', issuer_name='My Calendar App')

    # Generate QR code as base64 PNG
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return render_template('setup_2fa.html', secret=totp_secret, qr_b64=qr_b64)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ── Pages ────────────────────────────────────────────
@app.route('/')
@login_required
def index():
    return render_template('index.html')


# ── Classes ──────────────────────────────────────────
@app.route('/api/classes', methods=['GET'])
@login_required
def get_classes():
    return jsonify([c.to_dict() for c in Class.query.order_by(Class.order).all()])

@app.route('/api/classes', methods=['POST'])
@login_required
def create_class():
    data = request.get_json()
    max_order = db.session.query(db.func.max(Class.order)).scalar() or 0
    c = Class(name=data['name'], color=data.get('color','rgb(100,160,190)'),
              bg=data.get('bg','rgb(173,216,230)'), order=max_order+1)
    db.session.add(c); db.session.commit()
    return jsonify(c.to_dict()), 201

@app.route('/api/classes/<int:class_id>', methods=['PUT'])
@login_required
def update_class(class_id):
    c = Class.query.get_or_404(class_id)
    data = request.get_json()
    c.name=data.get('name',c.name); c.color=data.get('color',c.color)
    c.bg=data.get('bg',c.bg); c.archived=data.get('archived',c.archived)
    db.session.commit(); return jsonify(c.to_dict())

@app.route('/api/classes/<int:class_id>', methods=['DELETE'])
@login_required
def delete_class(class_id):
    c = Class.query.get_or_404(class_id)
    db.session.delete(c); db.session.commit(); return '', 204


# ── Events ───────────────────────────────────────────
@app.route('/api/events', methods=['GET'])
@login_required
def get_events():
    return jsonify([e.to_dict() for e in Event.query.order_by(Event.date).all()])

@app.route('/api/events', methods=['POST'])
@login_required
def create_event():
    data = request.get_json()
    created = []
    for ev_data in _expand_recurrence(data):
        ev = Event(**ev_data); db.session.add(ev); created.append(ev)
    db.session.commit()
    return jsonify([e.to_dict() for e in created]), 201

@app.route('/api/events/<int:event_id>', methods=['PUT'])
@login_required
def update_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json()
    event.date=data.get('date',event.date); event.title=data.get('title',event.title)
    event.cls=data.get('cls',event.cls); event.type=data.get('type',event.type)
    event.completed=data.get('completed',event.completed); event.notes=data.get('notes',event.notes)
    db.session.commit(); return jsonify(event.to_dict())

@app.route('/api/events/<int:event_id>', methods=['DELETE'])
@login_required
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    db.session.delete(event); db.session.commit(); return '', 204

@app.route('/api/events/<int:event_id>/duplicate', methods=['POST'])
@login_required
def duplicate_event(event_id):
    original = Event.query.get_or_404(event_id)
    data = request.get_json()
    new_ev = Event(date=data.get('date',original.date), title=original.title+' (copy)',
                   cls=original.cls, type=original.type, notes=original.notes,
                   completed=False, recur='none', recur_end='')
    db.session.add(new_ev); db.session.commit()
    return jsonify(new_ev.to_dict()), 201


# ── Theme ────────────────────────────────────────────
@app.route('/api/theme', methods=['GET'])
@login_required
def get_theme():
    return jsonify({t.key: t.value for t in Theme.query.all()})

@app.route('/api/theme', methods=['POST'])
@login_required
def update_theme():
    for k, v in request.get_json().items():
        t = Theme.query.filter_by(key=k).first()
        if t: t.value = v
        else: db.session.add(Theme(key=k, value=v))
    db.session.commit(); return jsonify({'ok': True})


# ── Notes ────────────────────────────────────────────
@app.route('/api/notes', methods=['GET'])
@login_required
def get_notes():
    return jsonify([n.to_dict() for n in Note.query.order_by(Note.date).all()])

@app.route('/api/notes', methods=['POST'])
@login_required
def create_note():
    data = request.get_json()
    n = Note(date=data['date'], text=data['text'])
    db.session.add(n); db.session.commit(); return jsonify(n.to_dict()), 201

@app.route('/api/notes/<int:note_id>', methods=['PUT'])
@login_required
def update_note(note_id):
    n = Note.query.get_or_404(note_id)
    data = request.get_json()
    n.text=data.get('text',n.text); n.date=data.get('date',n.date)
    n.completed=data.get('completed',n.completed)
    db.session.commit(); return jsonify(n.to_dict())

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
@login_required
def delete_note(note_id):
    n = Note.query.get_or_404(note_id)
    db.session.delete(n); db.session.commit(); return '', 204


# ── Helpers ──────────────────────────────────────────
def _expand_recurrence(data):
    recur = data.get('recur','none'); recur_end = data.get('recur_end','')
    base = {'date':data['date'],'title':data['title'],'cls':data['cls'],
            'type':data['type'],'completed':False,'notes':data.get('notes',''),
            'recur':recur,'recur_end':recur_end}
    if recur == 'none' or not recur_end: return [base]
    results = []; current = datetime.strptime(data['date'],'%Y-%m-%d')
    end = datetime.strptime(recur_end,'%Y-%m-%d')
    deltas = {'weekly':7,'fortnightly':14}
    while current <= end:
        entry = dict(base); entry['date'] = current.strftime('%Y-%m-%d')
        results.append(entry)
        if recur == 'monthly':
            mo = current.month+1; yr = current.year+(mo-1)//12; mo = ((mo-1)%12)+1
            try: current = current.replace(year=yr,month=mo)
            except ValueError: break
        else: current += timedelta(days=deltas.get(recur,7))
    return results


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
