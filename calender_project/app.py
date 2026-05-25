from flask import Flask, render_template, request, jsonify
from models import db, Event

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///calendar.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

with app.app_context():
    db.create_all()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/events', methods=['GET'])
def get_events():
    events = Event.query.order_by(Event.date).all()
    return jsonify([e.to_dict() for e in events])


@app.route('/api/events', methods=['POST'])
def create_event():
    data = request.get_json()
    event = Event(
        date=data['date'],
        title=data['title'],
        cls=data['cls'],
        type=data['type']
    )
    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201


@app.route('/api/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json()
    event.date = data.get('date', event.date)
    event.title = data.get('title', event.title)
    event.cls = data.get('cls', event.cls)
    event.type = data.get('type', event.type)
    db.session.commit()
    return jsonify(event.to_dict())


@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    return '', 204

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
