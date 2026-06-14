// ========== GLOBAL FUNCTIONS ==========

// Check authentication on page load
async function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        const userData = JSON.parse(user);
        document.getElementById('userName').textContent = userData.full_name || userData.username;
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('authButtons').style.display = 'none';
        
        // Load user avatar if exists
        if (userData.avatar) {
            document.getElementById('userAvatar').src = userData.avatar;
        }
    } else {
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('authButtons').style.display = 'flex';
    }
}

// Login function
async function login(username, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            checkAuth();
            closeModals();
            location.reload();
            showNotification('Login successful!', 'success');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Login failed. Please try again.', 'error');
    }
}

// Register function with password confirmation
async function register(fullName, username, email, password, confirmPassword, role) {
    // Validate password match
    if (password !== confirmPassword) {
        showNotification('Passwords do not match!', 'error');
        return;
    }
    
    // Validate password length
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters long!', 'error');
        return;
    }
    
    console.log('Attempting registration for:', username);
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                full_name: fullName, 
                username, 
                email, 
                password,  // User's chosen password
                role 
            })
        });
        
        const data = await response.json();
        console.log('Register response status:', response.status);
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showNotification('Registration successful! Welcome to SmartAssess!', 'success');
            closeModals();
            checkAuth();
            
            // Redirect to dashboard after 1 second
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            showNotification(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

// Logout function
function logout() {
    localStorage.clear();
    location.reload();
}

// Load available exams
async function loadExams() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const subject = document.getElementById('subjectFilter')?.value || 'all';
    const response = await fetch(`/api/exams?subject=${subject}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const exams = await response.json();
    
    const container = document.getElementById('examsList');
    if (!container) return;
    
    if (exams.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px;">No exams available at the moment.</p>';
        return;
    }
    
    container.innerHTML = exams.map(exam => `
        <div class="exam-card" onclick="startExam(${exam.id})">
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h3>${escapeHtml(exam.title)}</h3>
                    <span class="exam-badge">${exam.total_questions || 0} Questions</span>
                </div>
                <p style="color: var(--gray); margin: 10px 0;">${exam.subject || 'General'}</p>
                <p style="font-size: 14px;">${exam.description || 'No description'}</p>
                <div style="margin-top: 15px; display: flex; gap: 15px; font-size: 13px; color: var(--gray);">
                    <span><i class="fas fa-clock"></i> ${exam.time_limit} min</span>
                    <span><i class="fas fa-trophy"></i> Pass: ${exam.passing_score}%</span>
                    <span><i class="fas fa-repeat"></i> Attempts: ${exam.attempts_count || 0}/${exam.attempts_allowed}</span>
                </div>
                ${exam.attempts_count >= exam.attempts_allowed ? 
                    '<p style="color: var(--danger); margin-top: 10px;">Maximum attempts reached</p>' : 
                    '<button class="btn btn-primary" style="margin-top: 15px; width: 100%;">Start Exam</button>'
                }
            </div>
        </div>
    `).join('');
}

// Start exam
async function startExam(examId) {
    const token = localStorage.getItem('token');
    
    // Start attempt
    const response = await fetch(`/api/exams/${examId}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (response.ok) {
        window.location.href = `/take-exam/${examId}?attempt=${data.attemptId}`;
    } else {
        showNotification(data.error, 'error');
    }
}

// Show notification
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        ${message}
    `;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        border-left: 4px solid ${type === 'success' ? '#10B981' : '#EF4444'};
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Modal functions
function showLoginModal() {
    document.getElementById('loginModal').classList.add('show');
}

function showRegisterModal() {
    document.getElementById('registerModal').classList.add('show');
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
}
// ============ MODAL FUNCTIONS (with null checks) ============

function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        console.log('Login modal not found on this page');
    }
}

function showRegisterModal() {
    const modal = document.getElementById('registerModal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        console.log('Register modal not found on this page');
    }
}

function closeModals() {
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    if (loginModal) loginModal.style.display = 'none';
    if (registerModal) registerModal.style.display = 'none';
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== EVENT LISTENERS ==========

// Hamburger menu
const hamburger = document.getElementById('hamburger');
if (hamburger) {
    hamburger.addEventListener('click', () => {
        document.getElementById('navMenu').classList.toggle('active');
        hamburger.classList.toggle('active');
    });
}

// Login form
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        login(username, password);
    });
}

// Register form
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fullName = document.getElementById('regFullName').value;
        const username = document.getElementById('regUsername').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        const role = document.getElementById('regRole').value;
        register(fullName, username, email, password, role);
    });
}

// Logout button
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
}

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModals();
    }
});

// Initialize
checkAuth();
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    loadExams();
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);