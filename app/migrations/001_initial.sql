CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  login TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN','INSTRUCTOR','STUDENT'))
) STRICT;

CREATE TABLE instructors (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, car TEXT NOT NULL,
  userId TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL, searchName TEXT NOT NULL UNIQUE,
  instructorId TEXT NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE students (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL, searchName TEXT NOT NULL,
  phone TEXT NOT NULL, phoneDigits TEXT NOT NULL, birthDate TEXT NOT NULL,
  groupId TEXT REFERENCES groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','GRADUATED','EXPELLED')),
  theoryProgress INTEGER NOT NULL DEFAULT 0 CHECK(theoryProgress BETWEEN 0 AND 100),
  userId TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  deletedAt INTEGER
) STRICT;

CREATE TABLE lessons (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('GROUP','INDIVIDUAL')),
  date TEXT NOT NULL, startTime TEXT NOT NULL,
  startMinute INTEGER NOT NULL CHECK(startMinute BETWEEN 0 AND 1439),
  durationMin INTEGER NOT NULL CHECK(durationMin BETWEEN 15 AND 480 AND startMinute + durationMin <= 1440),
  groupId TEXT REFERENCES groups(id) ON DELETE RESTRICT,
  studentId TEXT REFERENCES students(id) ON DELETE RESTRICT,
  instructorId TEXT NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
  topic TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PLANNED','DONE','CANCELLED')),
  CHECK((type = 'GROUP' AND groupId IS NOT NULL AND studentId IS NULL) OR
        (type = 'INDIVIDUAL' AND studentId IS NOT NULL AND groupId IS NULL))
) STRICT;

CREATE TABLE payments (
  receiptNumber INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  studentId TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  studentName TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL, method TEXT NOT NULL CHECK(method IN ('CASH','CARD','TRANSFER')),
  comment TEXT NOT NULL
) STRICT;

CREATE TABLE requests (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('NEW','DONE')),
  createdAt TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  tokenHash TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expiresAt INTEGER NOT NULL
) STRICT;

CREATE INDEX sessions_expiration ON sessions(expiresAt);
CREATE INDEX groups_instructor ON groups(instructorId);
CREATE INDEX students_group ON students(groupId, deletedAt);
CREATE INDEX students_search ON students(searchName);
CREATE INDEX lessons_calendar ON lessons(status, date, startMinute);
CREATE INDEX lessons_instructor ON lessons(instructorId, date, startMinute);
CREATE INDEX lessons_student ON lessons(studentId);
CREATE INDEX lessons_group ON lessons(groupId);
CREATE INDEX payments_date ON payments(date);
CREATE INDEX payments_student ON payments(studentId, date);
CREATE INDEX requests_status ON requests(status, createdAt);

CREATE TRIGGER lesson_insert_overlap BEFORE INSERT ON lessons
WHEN NEW.status <> 'CANCELLED' AND EXISTS (
  SELECT 1 FROM lessons WHERE instructorId = NEW.instructorId AND date = NEW.date
    AND status <> 'CANCELLED' AND startMinute < NEW.startMinute + NEW.durationMin
    AND startMinute + durationMin > NEW.startMinute
)
BEGIN SELECT RAISE(ABORT, 'LESSON_OVERLAP'); END;

CREATE TRIGGER lesson_update_overlap BEFORE UPDATE ON lessons
WHEN NEW.status <> 'CANCELLED' AND EXISTS (
  SELECT 1 FROM lessons WHERE id <> OLD.id AND instructorId = NEW.instructorId AND date = NEW.date
    AND status <> 'CANCELLED' AND startMinute < NEW.startMinute + NEW.durationMin
    AND startMinute + durationMin > NEW.startMinute
)
BEGIN SELECT RAISE(ABORT, 'LESSON_OVERLAP'); END;

CREATE TRIGGER payment_active_student BEFORE INSERT ON payments
WHEN NOT EXISTS (
  SELECT 1 FROM students WHERE id = NEW.studentId AND status = 'ACTIVE' AND deletedAt IS NULL
)
BEGIN SELECT RAISE(ABORT, 'STUDENT_INACTIVE'); END;
