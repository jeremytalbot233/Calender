from flask import Flask, render_template, request, jsonify, session, redirect, url_for, Response
from models import db, Event, Class, Theme, Note, Template
import os, hashlib, hmac, pyotp, qrcode, io, base64
from datetime import datetime, timedelta, date
from functools import wraps
from apscheduler.schedulers.background import BackgroundScheduler
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import atexit

app = Flask(__name__)

uri = os.environ.get('DATABASE_URL', 'sqlite:///local.db')
if uri and uri.startswith('postgres://'):
    uri = uri.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
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
    '--bg': '#f4f1eb', '--surface': '#fffef9', '--border': '#ddd8cc',
    '--text': '#1a1612', '--muted': '#7a7060',
    '--font-body': 'DM Sans', '--font-mono': 'DM Mono', '--font-heading': 'DM Serif Display',
    'cal-year': '2026', 'cal-subtitle': '2026 — All Due Dates',
    'term1-start': '2026-01-27', 'term1-end': '2026-04-10',
    'term2-start': '2026-04-27', 'term2-end': '2026-07-03',
    'term3-start': '2026-07-20', 'term3-end': '2026-09-25',
    'term4-start': '2026-10-12', 'term4-end': '2026-12-11',
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


# ── Auth ─────────────────────────────────────────────
def hash_password(p):
    return hmac.new(app.config['SECRET_KEY'].encode(), p.encode(), hashlib.sha256).hexdigest()

def check_password(p):
    plain = os.environ.get('APP_PASSWORD', '')
    return bool(plain) and hmac.compare_digest(hash_password(p), hash_password(plain))

def verify_totp(code):
    secret = os.environ.get('TOTP_SECRET', '')
    if not secret: return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('logged_in'):
            if request.is_json: return jsonify({'error': 'Unauthorised'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('logged_in'): return redirect(url_for('index'))
    error = None
    if request.method == 'POST':
        if check_password(request.form.get('password', '')):
            session['pw_verified'] = True
            return redirect(url_for('verify_2fa'))
        error = 'Incorrect password. Please try again.'
    return render_template('login.html', error=error)

@app.route('/verify', methods=['GET', 'POST'])
def verify_2fa():
    if not session.get('pw_verified'): return redirect(url_for('login'))
    if session.get('logged_in'): return redirect(url_for('index'))
    totp_secret = os.environ.get('TOTP_SECRET', '')
    if not totp_secret: return redirect(url_for('setup_2fa'))
    error = None
    if request.method == 'POST':
        if verify_totp(request.form.get('code', '').replace(' ', '')):
            session.permanent = True
            session['logged_in'] = True
            session.pop('pw_verified', None)
            return redirect(url_for('index'))
        error = 'Invalid code. Please try again.'
    return render_template('verify.html', error=error)

@app.route('/setup-2fa')
def setup_2fa():
    if not session.get('pw_verified'): return redirect(url_for('login'))
    totp_secret = os.environ.get('TOTP_SECRET', '') or pyotp.random_base32()
    uri = pyotp.TOTP(totp_secret).provisioning_uri(name='Class Calendar', issuer_name='My Calendar App')
    img = qrcode.make(uri)
    buf = io.BytesIO(); img.save(buf, format='PNG')
    qr_b64 = base64.b64encode(buf.getvalue()).decode()
    return render_template('setup_2fa.html', secret=totp_secret, qr_b64=qr_b64)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

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



# ── Templates ─────────────────────────────────────────
@app.route('/api/templates', methods=['GET'])
@login_required
def get_templates():
    return jsonify([t.to_dict() for t in Template.query.order_by(Template.title).all()])

@app.route('/api/templates', methods=['POST'])
@login_required
def create_template():
    data = request.get_json()
    t = Template(
        title=data['title'],
        cls=data.get('cls'),
        type=data.get('type', 'assignment'),
        notes=data.get('notes', '')
    )
    db.session.add(t); db.session.commit()
    return jsonify(t.to_dict()), 201

@app.route('/api/templates/<int:tmpl_id>', methods=['DELETE'])
@login_required
def delete_template(tmpl_id):
    t = Template.query.get_or_404(tmpl_id)
    db.session.delete(t); db.session.commit(); return '', 204


# ── Bulk actions ──────────────────────────────────────
@app.route('/api/events/bulk', methods=['POST'])
@login_required
def bulk_action():
    data    = request.get_json()
    action  = data.get('action')   # delete | complete | move
    ids     = data.get('ids', [])
    events  = Event.query.filter(Event.id.in_(ids)).all()

    if action == 'delete':
        for ev in events:
            db.session.delete(ev)

    elif action == 'complete':
        for ev in events:
            ev.completed = True

    elif action == 'move':
        new_date = data.get('date')
        if new_date:
            for ev in events:
                ev.date = new_date

    db.session.commit()
    return jsonify({'ok': True, 'affected': len(events)})


# ── Undo restore ──────────────────────────────────────
@app.route('/api/events/restore', methods=['POST'])
@login_required
def restore_events():
    snapshots = request.get_json().get('snapshots', [])
    for snap in snapshots:
        existing = Event.query.get(snap['id'])
        if existing:
            existing.date=snap['date']; existing.title=snap['title']
            existing.cls=snap['cls'];   existing.type=snap['type']
            existing.completed=snap['completed']; existing.notes=snap['notes']
        else:
            db.session.add(Event(
                id=snap['id'], date=snap['date'], title=snap['title'],
                cls=snap['cls'], type=snap['type'], completed=snap['completed'],
                notes=snap['notes'], recur=snap.get('recur','none'), recur_end=snap.get('recur_end','')
            ))
    db.session.commit()
    return jsonify({'ok': True})


# ── iCal export ──────────────────────────────────────
@app.route('/export/ical')
@login_required
def export_ical():
    events = Event.query.order_by(Event.date).all()
    classes = {c.id: c for c in Class.query.all()}

    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Class Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:Class Calendar',
        'X-WR-TIMEZONE:Australia/Adelaide',
    ]

    for ev in events:
        cls = classes.get(ev.cls)
        cls_name = cls.name if cls else 'Unknown'
        dt = ev.date.replace('-', '')
        uid = f'event-{ev.id}@classcalendar'
        summary = f'{ev.title} [{cls_name}]'
        description = f'Class: {cls_name}\\nType: {ev.type}'
        if ev.notes:
            description += f'\\nNotes: {ev.notes}'

        lines += [
            'BEGIN:VEVENT',
            f'UID:{uid}',
            f'DTSTART;VALUE=DATE:{dt}',
            f'DTEND;VALUE=DATE:{dt}',
            f'SUMMARY:{summary}',
            f'DESCRIPTION:{description}',
            f'STATUS:{"COMPLETED" if ev.completed else "CONFIRMED"}',
            'END:VEVENT',
        ]

    lines.append('END:VCALENDAR')
    ical_content = '\r\n'.join(lines)

    return Response(
        ical_content,
        mimetype='text/calendar',
        headers={'Content-Disposition': 'attachment; filename=class-calendar.ics'}
    )


# ── Email digest ─────────────────────────────────────
def send_weekly_digest():
    """Send Monday morning digest of this week's due dates."""
    with app.app_context():
        try:
            smtp_user = os.environ.get('SMTP_USER', '')
            smtp_pass = os.environ.get('SMTP_PASS', '')
            to_email  = os.environ.get('DIGEST_EMAIL', smtp_user)

            if not smtp_user or not smtp_pass:
                print('Email not configured — skipping digest')
                return

            today = date.today()
            week_end = today + timedelta(days=6)

            events = Event.query.filter(
                Event.date >= today.isoformat(),
                Event.date <= week_end.isoformat(),
                Event.completed == False
            ).order_by(Event.date).all()

            classes = {c.id: c for c in Class.query.all()}

            # Build HTML email
            if not events:
                body_html = '<p>No due dates this week. Enjoy the break! 🎉</p>'
            else:
                rows = ''
                for ev in events:
                    cls = classes.get(ev.cls)
                    cls_name = cls.name if cls else 'Unknown'
                    bg = cls.bg if cls else '#eee'
                    color = cls.color if cls else '#333'
                    d = datetime.strptime(ev.date, '%Y-%m-%d')
                    date_str = d.strftime('%A %-d %b')
                    rows += f'''
                    <tr>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:13px;color:#666;">{date_str}</td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">{ev.title}</td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;">
                        <span style="background:{bg};color:{color};padding:2px 8px;border-radius:20px;font-size:12px;font-weight:600;">{cls_name}</span>
                      </td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#888;">{ev.type}</td>
                    </tr>'''

                body_html = f'''
                <table style="border-collapse:collapse;width:100%;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #ddd;">
                  <thead>
                    <tr style="background:#1a1612;color:#f4f1eb;">
                      <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;letter-spacing:0.05em;">DATE</th>
                      <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;letter-spacing:0.05em;">TASK</th>
                      <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;letter-spacing:0.05em;">CLASS</th>
                      <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;letter-spacing:0.05em;">TYPE</th>
                    </tr>
                  </thead>
                  <tbody>{rows}</tbody>
                </table>'''

            week_str = f"{today.strftime('%-d %b')} – {week_end.strftime('%-d %b %Y')}"
            html = f'''
            <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f1eb;padding:24px;border-radius:12px;">
              <h1 style="font-family:Georgia,serif;font-size:24px;color:#1a1612;margin-bottom:4px;">📅 Class Calendar</h1>
              <p style="font-family:monospace;font-size:13px;color:#7a7060;margin-bottom:24px;">Week of {week_str}</p>
              <h2 style="font-size:16px;color:#1a1612;margin-bottom:12px;">Due this week — {len(events)} item{"s" if len(events) != 1 else ""}</h2>
              {body_html}
              <p style="font-size:12px;color:#aaa;margin-top:24px;text-align:center;">Sent automatically every Monday morning from your Class Calendar</p>
            </div>'''

            msg = MIMEMultipart('alternative')
            msg['Subject'] = f'📅 Class Calendar — Week of {week_str}'
            msg['From']    = smtp_user
            msg['To']      = to_email
            msg.attach(MIMEText(html, 'html'))

            # Outlook uses port 587 with STARTTLS
            with smtplib.SMTP('smtp.office365.com', 587) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)

            print(f'Weekly digest sent to {to_email}')

        except Exception as e:
            print(f'Failed to send digest: {e}')


@app.route('/api/send-digest', methods=['POST'])
@login_required
def trigger_digest():
    """Manual trigger for testing the email digest."""
    send_weekly_digest()
    return jsonify({'ok': True})


# ── Scheduler ────────────────────────────────────────
scheduler = BackgroundScheduler(timezone='Australia/Adelaide')
scheduler.add_job(
    func=send_weekly_digest,
    trigger='cron',
    day_of_week='mon',
    hour=7,
    minute=0
)
scheduler.start()
atexit.register(lambda: scheduler.shutdown())


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
