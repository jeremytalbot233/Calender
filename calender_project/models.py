from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.String(10), nullable=False)   # 'YYYY-MM-DD'
    title = db.Column(db.String(200), nullable=False)
    cls = db.Column(db.String(10), nullable=False)     # c1–c6
    type = db.Column(db.String(20), nullable=False)    # assignment / formative

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date,
            'title': self.title,
            'cls': self.cls,
            'type': self.type,
        }