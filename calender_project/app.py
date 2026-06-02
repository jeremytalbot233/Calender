from flask import Flask, render_template, request, jsonify
from models import db, Event, Class, Theme, Note
import os
from datetime import datetime, timedelta

app = Flask(__name__)

uri = os.environ.get('DATABASE_URL', 'sqlite:///local.db')
if uri and uri.startswith('postgres://'):
    uri = uri.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
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


# ── Pages ────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


# ── Classes ──────────────────────────────────────────
@app.route('/api/classes', methods=['GET'])
def get_classes():
    classes = Class.query.order_by(Class.order).all()
    return jsonify([c.to_dict() for c in classes])

@app.route('/api/classes', methods=['POST'])
def create_class():
    data = request.get_json()
    max_order = db.session.query(db.func.max(Class.order)).scalar() or 0
    c = Class(
        name=data['name'],
        color=data.get('color', 'rgb(100,160,190)'),
        bg=data.get('bg', 'rgb(173,216,230)'),
        order=max_order + 1
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201

@app.route('/api/classes/<int:class_id>', methods=['PUT'])
def update_class(class_id):
    c = Class.query.get_or_404(class_id)
    data = request.get_json()
    c.name     = data.get('name', c.name)
    c.color    = data.get('color', c.color)
    c.bg       = data.get('bg', c.bg)
    c.archived = data.get('archived', c.archived)
    db.session.commit()
    return jsonify(c.to_dict())

@app.route('/api/classes/<int:class_id>', methods=['DELETE'])
def delete_class(class_id):
    c = Class.query.get_or_404(class_id)
    db.session.delete(c)
    db.session.commit()
    return '', 204


# ── Events ───────────────────────────────────────────
@app.route('/api/events', methods=['GET'])
def get_events():
    events = Event.query.order_by(Event.date).all()
    return jsonify([e.to_dict() for e in events])

@app.route('/api/events', methods=['POST'])
def create_event():
    data = request.get_json()
    events_to_create = _expand_recurrence(data)
    created = []
    for ev_data in events_to_create:
        ev = Event(**ev_data)
        db.session.add(ev)
        created.append(ev)
    db.session.commit()
    return jsonify([e.to_dict() for e in created]), 201

@app.route('/api/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json()
    event.date      = data.get('date', event.date)
    event.title     = data.get('title', event.title)
    event.cls       = data.get('cls', event.cls)
    event.type      = data.get('type', event.type)
    event.completed = data.get('completed', event.completed)
    event.notes     = data.get('notes', event.notes)
    db.session.commit()
    return jsonify(event.to_dict())

@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    return '', 204

@app.route('/api/events/<int:event_id>/duplicate', methods=['POST'])
def duplicate_event(event_id):
    original = Event.query.get_or_404(event_id)
    data = request.get_json()
    new_ev = Event(
        date=data.get('date', original.date),
        title=original.title + ' (copy)',
        cls=original.cls,
        type=original.type,
        notes=original.notes,
        completed=False,
        recur='none',
        recur_end=''
    )
    db.session.add(new_ev)
    db.session.commit()
    return jsonify(new_ev.to_dict()), 201


# ── Theme ────────────────────────────────────────────
@app.route('/api/theme', methods=['GET'])
def get_theme():
    theme = Theme.query.all()
    return jsonify({t.key: t.value for t in theme})

@app.route('/api/theme', methods=['POST'])
def update_theme():
    data = request.get_json()
    for k, v in data.items():
        t = Theme.query.filter_by(key=k).first()
        if t:
            t.value = v
        else:
            db.session.add(Theme(key=k, value=v))
    db.session.commit()
    return jsonify({'ok': True})


# ── Notes ────────────────────────────────────────────
@app.route('/api/notes', methods=['GET'])
def get_notes():
    notes = Note.query.order_by(Note.date).all()
    return jsonify([n.to_dict() for n in notes])

@app.route('/api/notes', methods=['POST'])
def create_note():
    data = request.get_json()
    n = Note(date=data['date'], text=data['text'])
    db.session.add(n)
    db.session.commit()
    return jsonify(n.to_dict()), 201

@app.route('/api/notes/<int:note_id>', methods=['PUT'])
def update_note(note_id):
    n = Note.query.get_or_404(note_id)
    data = request.get_json()
    n.text      = data.get('text', n.text)
    n.date      = data.get('date', n.date)
    n.completed = data.get('completed', n.completed)
    db.session.commit()
    return jsonify(n.to_dict())

@app.route('/api/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    n = Note.query.get_or_404(note_id)
    db.session.delete(n)
    db.session.commit()
    return '', 204


# ── Helpers ──────────────────────────────────────────
def _expand_recurrence(data):
    recur     = data.get('recur', 'none')
    recur_end = data.get('recur_end', '')
    base = {
        'date':      data['date'],
        'title':     data['title'],
        'cls':       data['cls'],
        'type':      data['type'],
        'completed': False,
        'notes':     data.get('notes', ''),
        'recur':     recur,
        'recur_end': recur_end,
    }
    if recur == 'none' or not recur_end:
        return [base]

    deltas = {'weekly': 7, 'fortnightly': 14, 'monthly': 0}
    results = []
    current = datetime.strptime(data['date'], '%Y-%m-%d')
    end     = datetime.strptime(recur_end, '%Y-%m-%d')

    while current <= end:
        entry = dict(base)
        entry['date'] = current.strftime('%Y-%m-%d')
        results.append(entry)
        if recur == 'monthly':
            mo = current.month + 1
            yr = current.year + (mo - 1) // 12
            mo = ((mo - 1) % 12) + 1
            try:
                current = current.replace(year=yr, month=mo)
            except ValueError:
                break
        else:
            current += timedelta(days=deltas[recur])

    return results


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
