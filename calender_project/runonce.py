# seed.py  (run once, then delete)
from app import app
from models import db, Event

events = [
    # paste your full events list here, e.g.:
    {"date":"2026-02-11","title":"Research & Ethics (Draft)","cls":"c1","type":"formative"},
    # ... all the rest
]

with app.app_context():
    for e in events:
        db.session.add(Event(**e))
    db.session.commit()
    print("Seeded", len(events), "events.")