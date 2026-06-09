from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Class(db.Model):
    __tablename__ = 'classes'
    id       = db.Column(db.Integer, primary_key=True)
    name     = db.Column(db.String(100), nullable=False)
    color    = db.Column(db.String(30), nullable=False, default='rgb(100,160,190)')
    bg       = db.Column(db.String(30), nullable=False, default='rgb(173,216,230)')
    archived = db.Column(db.Boolean, default=False)
    order    = db.Column(db.Integer, default=0)
    events   = db.relationship('Event', backref='class_ref', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':       self.id,
            'name':     self.name,
            'color':    self.color,
            'bg':       self.bg,
            'archived': self.archived,
            'order':    self.order,
        }

class Event(db.Model):
    __tablename__ = 'events'
    id          = db.Column(db.Integer, primary_key=True)
    date        = db.Column(db.String(10), nullable=False)
    title       = db.Column(db.String(200), nullable=False)
    cls         = db.Column(db.Integer, db.ForeignKey('classes.id'), nullable=False)
    type        = db.Column(db.String(30), nullable=False, default='assignment')
    completed   = db.Column(db.Boolean, default=False)
    notes       = db.Column(db.Text, default='')
    recur       = db.Column(db.String(20), default='none')   # none | weekly | fortnightly | monthly
    recur_end   = db.Column(db.String(10), default='')

    def to_dict(self):
        return {
            'id':        self.id,
            'date':      self.date,
            'title':     self.title,
            'cls':       self.cls,
            'type':      self.type,
            'completed': self.completed,
            'notes':     self.notes,
            'recur':     self.recur,
            'recur_end': self.recur_end,
        }

class Note(db.Model):
    __tablename__ = 'notes'
    id        = db.Column(db.Integer, primary_key=True)
    date      = db.Column(db.String(10), nullable=False)
    text      = db.Column(db.Text, nullable=False)
    completed = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id':        self.id,
            'date':      self.date,
            'text':      self.text,
            'completed': self.completed,
        }

class Template(db.Model):
    __tablename__ = 'templates'
    id    = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    cls   = db.Column(db.Integer, db.ForeignKey('classes.id'), nullable=True)
    type  = db.Column(db.String(30), nullable=False, default='assignment')
    notes = db.Column(db.Text, default='')

    def to_dict(self):
        return {
            'id':    self.id,
            'title': self.title,
            'cls':   self.cls,
            'type':  self.type,
            'notes': self.notes,
        }


class Theme(db.Model):
    __tablename__ = 'theme'
    id    = db.Column(db.Integer, primary_key=True)
    key   = db.Column(db.String(50), unique=True, nullable=False)
    value = db.Column(db.String(200), nullable=False)

    def to_dict(self):
        return {'key': self.key, 'value': self.value}
