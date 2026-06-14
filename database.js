const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./assessment.db');

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Create all tables
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      avatar TEXT DEFAULT '/assets/default-avatar.png',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      is_active BOOLEAN DEFAULT 1
    )
  `);

  // Exams table
  db.run(`
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      creator_id INTEGER NOT NULL,
      subject TEXT,
      grade_level TEXT,
      time_limit INTEGER DEFAULT 60,
      passing_score INTEGER DEFAULT 60,
      attempts_allowed INTEGER DEFAULT 1,
      is_published BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      scheduled_date DATETIME,
      end_date DATETIME,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // Questions table
  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT CHECK(correct_answer IN ('A', 'B', 'C', 'D')),
      points INTEGER DEFAULT 1,
      explanation TEXT,
      FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
    )
  `);

  // Exam attempts table
  db.run(`
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      score INTEGER,
      percentage REAL,
      passed BOOLEAN,
      answers TEXT,
      feedback TEXT,
      FOREIGN KEY (exam_id) REFERENCES exams(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    )
  `);

  // Results table for detailed grading
  db.run(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      student_answer TEXT,
      is_correct BOOLEAN,
      points_earned INTEGER,
      FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )
  `);

  // Categories for organizing exams
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT
    )
  `);

  // Insert default categories
  const categories = [
    { name: 'Mathematics', icon: '📐' },
    { name: 'Science', icon: '🔬' },
    { name: 'English', icon: '📖' },
    { name: 'History', icon: '🏛️' },
    { name: 'Computer Science', icon: '💻' },
    { name: 'Business', icon: '💼' }
  ];

  categories.forEach(cat => {
    db.run('INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)', [cat.name, cat.icon]);
  });

  // Create default admin user
  const defaultAdmin = {
    username: 'admin',
    email: 'admin@example.com',
    full_name: 'System Administrator',
    role: 'admin'
  };

  bcrypt.hash('Admin@123', 10, (err, hash) => {
    if (!err) {
      db.run(`
        INSERT OR IGNORE INTO users (username, email, password, full_name, role)
        VALUES (?, ?, ?, ?, ?)
      `, [defaultAdmin.username, defaultAdmin.email, hash, defaultAdmin.full_name, defaultAdmin.role]);
    }
  });

  console.log('✅ Database initialized successfully');
});

module.exports = db;