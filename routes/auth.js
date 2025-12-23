const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const bcrypt = require('bcrypt');

// Configure Multer for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
    }
});
const upload = multer({ storage: storage });

// Get Departments (Public for Registration)
router.get('/departments', (req, res) => {
    db.all("SELECT * FROM departments", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Public Stats (For Landing Page)
router.get('/public-stats', (req, res) => {
    const stats = {};
    db.get("SELECT count(*) as count FROM students", (err, row) => {
        if (err) return res.status(500).json({ error: err });
        stats.students = row.count;
        
        // Breakdown by Department
        db.all(`SELECT d.department_name, count(s.student_id) as count 
                FROM departments d 
                LEFT JOIN students s ON d.department_id = s.department_id 
                GROUP BY d.department_id`, (err, rows) => {
            if (err) return res.status(500).json({ error: err });
            stats.breakdown = rows;
            res.json(stats);
        });
    });
});

// Register Student
router.post('/register', upload.single('student_image'), (req, res) => {
    const { prefix, first_name, last_name, dob, phone, department_id, student_code, level, blood_group, father_name, mother_name, parent_phone } = req.body;
    const student_image = req.file ? `/uploads/${req.file.filename}` : null;
    
    if (!first_name || !last_name || !dob || !department_id || !student_code || !level) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลหลักให้ครบถ้วน' });
    }

    // Password Generation: DD/MM/YYYY using Buddhist Era (B.E.)
    const [year, month, day] = dob.split('-');
    const beYear = parseInt(year) + 543;
    const passwordRaw = `${day}/${month}/${beYear}`;

    const saltRounds = 10;
    bcrypt.hash(passwordRaw, saltRounds, (err, hash) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const stmt = db.prepare("INSERT INTO students (prefix, first_name, last_name, dob, phone, department_id, student_code, password, level, blood_group, student_image, father_name, mother_name, parent_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        stmt.run(prefix, first_name, last_name, dob, phone, department_id, student_code, hash, level, blood_group, student_image, father_name, mother_name, parent_phone, function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'รหัสนักศึกษานี้มีอยู่ในระบบแล้ว' });
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'ลงทะเบียนสำเร็จ', student_code: student_code });
        });
        stmt.finalize();
    });
});

// Student Login
router.post('/login/student', (req, res) => {
    let { student_code, password } = req.body;
    
    // Normalize Input Password to DD/MM/YYYY
    // Ex: 1/1/2550 -> 01/01/2550
    // Ex: 01012550 -> 01/01/2550
    console.log(`Login attempt for: ${student_code}, Raw Pwd: ${password}`);

    if (password) {
        // Remove non-numeric except slash
        let cleanPwd = password.replace(/[^0-9\/]/g, '');
        
        // If has slashes, normalize padding
        if (cleanPwd.includes('/')) {
            const parts = cleanPwd.split('/');
            if (parts.length === 3) {
                const d = parts[0].padStart(2, '0');
                const m = parts[1].padStart(2, '0');
                const y = parts[2];
                cleanPwd = `${d}/${m}/${y}`;
            }
        } else if (cleanPwd.length === 8) {
            // If just numbers (01012550), add slashes
            const d = cleanPwd.substring(0, 2);
            const m = cleanPwd.substring(2, 4);
            const y = cleanPwd.substring(4, 8);
            cleanPwd = `${d}/${m}/${y}`;
        }
        
        password = cleanPwd;
    }
    console.log(`Normalized Pwd: ${password}`);
    
    db.get("SELECT * FROM students WHERE student_code = ?", [student_code], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'ไม่พบข้อมูลนักศึกษา' }); // User not found
        
        bcrypt.compare(password, row.password, (err, result) => {
            if (result) {
                req.session.userId = row.student_id;
                req.session.role = 'student';
                req.session.userName = row.first_name + ' ' + row.last_name;
                req.session.studentCode = row.student_code;
                return res.json({ success: true, redirect: '/student_dashboard.html' });
            } else {
                return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง (วันเกิด DDMMYYYY)' }); // Invalid password
            }
        });
    });
});

// Admin Login
router.post('/login/admin', (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT * FROM admin_users WHERE username = ?", [username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'ไม่พบผู้ดูแลระบบ' });
        
        bcrypt.compare(password, row.password, (err, result) => {
            if (result) {
                req.session.userId = row.admin_id;
                req.session.role = 'admin';
                req.session.userName = row.username;
                return res.json({ success: true, redirect: '/admin_dashboard.html' });
            } else {
                return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
            }
        });
    });
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'Could not log out' });
        res.json({ success: true, redirect: '/index.html' });
    });
});

module.exports = router;
