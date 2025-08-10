from sqlmodel import SQLModel, create_engine, Session

engine = create_engine("sqlite:///./app.db")

def init_db():
    SQLModel.metadata.create_all(engine)

def save(model):
    with Session(engine) as s:
        s.add(model)
        s.commit()
