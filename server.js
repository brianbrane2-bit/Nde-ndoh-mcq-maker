require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARE (Fixed CSP) ============

// Allow CORS
app.use(cors());

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files with proper security headers
app.use(express.static('public', {
    setHeaders: (res, path) => {
        // Allow inline scripts and styles
        res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https://images.unsplash.com; " +
    "connect-src 'self' ws: wss:;"
);
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ============ AUTHENTICATION MIDDLEWARE ============

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'secret-key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// ============ API ROUTES ============

// Register
app.post('/api/register', async (req, res) => {
    console.log('📝 Registration request:', req.body.username);
    
    try {
        const { full_name, username, email, password, role } = req.body;
        
        if (!full_name || !username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Check if user exists
        db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], async (err, user) => {
            if (user) {
                return res.status(400).json({ error: 'Username or email already exists' });
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            db.run(`
                INSERT INTO users (username, email, password, full_name, role)
                VALUES (?, ?, ?, ?, ?)
            `, [username, email, hashedPassword, full_name, role || 'student'], function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Registration failed' });
                }
                
                const token = jwt.sign(
                    { id: this.lastID, username, role: role || 'student' },
                    process.env.JWT_SECRET || 'secret-key',
                    { expiresIn: '7d' }
                );
                
                console.log('✅ User registered:', username);
                res.json({
                    token,
                    user: { id: this.lastID, username, email, full_name, role: role || 'student' }
                });
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/login', (req, res) => {
    console.log('🔐 Login request:', req.body.username);
    
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Update last login
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: '7d' }
        );
        
        console.log('✅ User logged in:', username);
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                avatar: user.avatar
            }
        });
    });
});

// Get user profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
    db.get(`
        SELECT id, username, email, full_name, role, avatar, created_at, last_login
        FROM users WHERE id = ?
    `, [req.user.id], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    });
});

// Update user profile
app.put('/api/user/profile', authenticateToken, (req, res) => {
    const { full_name, email } = req.body;
    
    db.run('UPDATE users SET full_name = ?, email = ? WHERE id = ?',
        [full_name, email, req.user.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

// Get all exams
app.get('/api/exams', authenticateToken, (req, res) => {
    const { subject } = req.query;
    let query = `
        SELECT e.*, u.full_name as creator_name,
               (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as total_questions,
               (SELECT COUNT(*) FROM exam_attempts WHERE exam_id = e.id AND student_id = ?) as attempts_count
        FROM exams e
        JOIN users u ON e.creator_id = u.id
        WHERE e.is_published = 1
    `;
    const params = [req.user.id];
    
    if (subject && subject !== 'all') {
        query += ' AND e.subject = ?';
        params.push(subject);
    }
    
    query += ' ORDER BY e.created_at DESC';
    
    db.all(query, params, (err, exams) => {
        res.json(exams || []);
    });
});

// Get exam by ID
app.get('/api/exams/:id', authenticateToken, (req, res) => {
    db.get(`
        SELECT e.*, u.full_name as creator_name,
               (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as total_questions
        FROM exams e
        JOIN users u ON e.creator_id = u.id
        WHERE e.id = ?
    `, [req.params.id], (err, exam) => {
        if (err || !exam) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        
        db.all('SELECT * FROM questions WHERE exam_id = ? ORDER BY id', [req.params.id], (err, questions) => {
            exam.questions = questions;
            res.json(exam);
        });
    });
});

// Create exam
app.post('/api/exams', authenticateToken, authorize('teacher', 'admin'), (req, res) => {
    const { title, description, subject, grade_level, time_limit, passing_score, attempts_allowed } = req.body;
    
    db.run(`
        INSERT INTO exams (title, description, creator_id, subject, grade_level, time_limit, passing_score, attempts_allowed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [title, description, req.user.id, subject, grade_level, time_limit || 60, passing_score || 60, attempts_allowed || 1], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, message: 'Exam created successfully' });
    });
});

// Add questions to exam
app.post('/api/exams/:examId/questions', authenticateToken, authorize('teacher', 'admin'), (req, res) => {
    const { examId } = req.params;
    const { questions } = req.body;
    
    db.get('SELECT creator_id FROM exams WHERE id = ?', [examId], (err, exam) => {
        if (!exam || exam.creator_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        const stmt = db.prepare(`
            INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer, points, explanation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        questions.forEach(q => {
            stmt.run([examId, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.points || 1, q.explanation]);
        });
        
        stmt.finalize();
        res.json({ message: 'Questions added successfully' });
    });
});

// Publish exam
app.put('/api/exams/:id/publish', authenticateToken, authorize('teacher', 'admin'), (req, res) => {
    db.get('SELECT creator_id FROM exams WHERE id = ?', [req.params.id], (err, exam) => {
        if (!exam || exam.creator_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        db.run('UPDATE exams SET is_published = 1 WHERE id = ?', [req.params.id], (err) => {
            res.json({ success: true });
        });
    });
});

// Start exam attempt
app.post('/api/exams/:id/start', authenticateToken, (req, res) => {
    const examId = req.params.id;
    const studentId = req.user.id;
    
    db.get(`
        SELECT attempts_allowed, COUNT(*) as attempts_count
        FROM exams e
        LEFT JOIN exam_attempts ea ON e.id = ea.exam_id AND ea.student_id = ?
        WHERE e.id = ?
    `, [studentId, examId], (err, result) => {
        if (result.attempts_count >= result.attempts_allowed) {
            return res.status(400).json({ error: 'Maximum attempts reached' });
        }
        
        db.run(`
            INSERT INTO exam_attempts (exam_id, student_id, start_time)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, [examId, studentId], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ attemptId: this.lastID });
        });
    });
});

// Submit exam
app.post('/api/exams/:id/submit', authenticateToken, (req, res) => {
    const { attemptId, answers } = req.body;
    
    db.all('SELECT * FROM questions WHERE exam_id = ?', [req.params.id], (err, questions) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        let totalPoints = 0;
        let earnedPoints = 0;
        const results = [];
        
        questions.forEach(question => {
            const studentAnswer = answers[question.id];
            const isCorrect = studentAnswer === question.correct_answer;
            const pointsEarned = isCorrect ? question.points : 0;
            
            totalPoints += question.points;
            earnedPoints += pointsEarned;
            
            results.push({
                questionId: question.id,
                studentAnswer,
                isCorrect,
                pointsEarned,
                correctAnswer: question.correct_answer,
                explanation: question.explanation
            });
            
            db.run(`
                INSERT INTO results (attempt_id, question_id, student_answer, is_correct, points_earned)
                VALUES (?, ?, ?, ?, ?)
            `, [attemptId, question.id, studentAnswer, isCorrect, pointsEarned]);
        });
        
        const percentage = (earnedPoints / totalPoints) * 100;
        const passed = percentage >= 60;
        
        db.run(`
            UPDATE exam_attempts
            SET end_time = CURRENT_TIMESTAMP, score = ?, percentage = ?, passed = ?, answers = ?
            WHERE id = ?
        `, [earnedPoints, percentage, passed, JSON.stringify(answers), attemptId], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                score: earnedPoints,
                totalPoints,
                percentage,
                passed,
                results
            });
        });
    });
});

// Get results
app.get('/api/results/attempt/:attemptId', authenticateToken, (req, res) => {
    db.get(`
        SELECT ea.*, e.title, e.passing_score,
               (SELECT COUNT(*) FROM results WHERE attempt_id = ea.id AND is_correct = 1) as correct_count,
               (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as total_questions
        FROM exam_attempts ea
        JOIN exams e ON ea.exam_id = e.id
        WHERE ea.id = ? AND ea.student_id = ?
    `, [req.params.attemptId, req.user.id], (err, attempt) => {
        if (err || !attempt) {
            return res.status(404).json({ error: 'Results not found' });
        }
        
        db.all(`
            SELECT r.*, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
                   q.correct_answer, q.explanation
            FROM results r
            JOIN questions q ON r.question_id = q.id
            WHERE r.attempt_id = ?
        `, [req.params.attemptId], (err, details) => {
            attempt.details = details;
            res.json(attempt);
        });
    });
});

// Get exam history
app.get('/api/results/history', authenticateToken, (req, res) => {
    db.all(`
        SELECT ea.*, e.title, e.subject,
               (SELECT COUNT(*) FROM results WHERE attempt_id = ea.id AND is_correct = 1) as correct_count,
               (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as total_questions
        FROM exam_attempts ea
        JOIN exams e ON ea.exam_id = e.id
        WHERE ea.student_id = ?
        ORDER BY ea.end_time DESC
    `, [req.user.id], (err, history) => {
        res.json(history || []);
    });
});

// Student analytics
app.get('/api/analytics/student', authenticateToken, (req, res) => {
    db.get(`
        SELECT
            COUNT(DISTINCT exam_id) as total_exams_taken,
            AVG(percentage) as average_score,
            SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) as exams_passed,
            MAX(percentage) as highest_score
        FROM exam_attempts
        WHERE student_id = ? AND end_time IS NOT NULL
    `, [req.user.id], (err, stats) => {
        res.json(stats || {});
    });
});

// Teacher analytics
app.get('/api/analytics/teacher', authenticateToken, authorize('teacher', 'admin'), (req, res) => {
    db.all(`
        SELECT
            e.id as exam_id,
            e.title,
            COUNT(DISTINCT ea.id) as total_attempts,
            COUNT(DISTINCT ea.student_id) as unique_students,
            AVG(ea.percentage) as average_score
        FROM exams e
        LEFT JOIN exam_attempts ea ON e.id = ea.exam_id
        WHERE e.creator_id = ?
        GROUP BY e.id
    `, [req.user.id], (err, stats) => {
        res.json(stats || []);
    });
});

// Get subjects
app.get('/api/subjects', (req, res) => {
    db.all(`
        SELECT DISTINCT subject FROM exams WHERE is_published = 1 AND subject IS NOT NULL
    `, [], (err, subjects) => {
        res.json(subjects || []);
    });
});

// Get certificate
app.get('/api/certificates/:attemptId', authenticateToken, (req, res) => {
    db.get(`
        SELECT ea.*, e.title, u.full_name as student_name
        FROM exam_attempts ea
        JOIN exams e ON ea.exam_id = e.id
        JOIN users u ON ea.student_id = u.id
        WHERE ea.id = ? AND ea.student_id = ? AND ea.passed = 1
    `, [req.params.attemptId, req.user.id], (err, data) => {
        if (err || !data) {
            return res.status(404).json({ error: 'Certificate not available' });
        }
        
        res.json({
            id: data.id,
            studentName: data.student_name,
            examTitle: data.title,
            score: `${Math.round(data.percentage)}%`,
            date: data.end_time,
            certificateId: `CERT-${data.id}-${Date.now()}`
        });
    });
});

// ============ SERVE HTML PAGES ============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/create-exam', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-exam.html'));
});

app.get('/take-exam/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'take-exam.html'));
});

app.get('/results/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

app.get('/analytics', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

app.get('/certificates', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'certificates.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});