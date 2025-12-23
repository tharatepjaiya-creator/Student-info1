const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../database');
const bcrypt = require('bcrypt');

// Configure Multer for File Uploads
// Configure Multer for File Uploads
const os = require('os');
const isProduction = process.env.NODE_ENV === 'production';
const uploadDir = isProduction ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)){
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (err) {
        console.error('Failed to create upload directory:', err);
    }
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
    }
});
const upload = multer({ storage: storage });

// Get Departments (Public for Registration)
router.get('/departments', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM departments");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Public Stats (For Landing Page)
router.get('/public-stats', async (req, res) => {
    const stats = {};
    try {
        const studentCount = await db.query("SELECT count(*) as count FROM students");
        stats.students = studentCount.rows[0].count;
        
        // Breakdown by Department
        const breakdown = await db.query(`
            SELECT d.department_name, count(s.student_id) as count 
            FROM departments d 
            LEFT JOIN students s ON d.department_id = s.department_id 
            GROUP BY d.department_id, d.department_name
        `);
        stats.breakdown = breakdown.rows;
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register Student
router.post('/register', upload.single('student_image'), async (req, res) => {
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
    try {
        const hash = await bcrypt.hash(passwordRaw, saltRounds);
        
        const query = `
            INSERT INTO students (prefix, first_name, last_name, dob, phone, department_id, student_code, password, level, blood_group, student_image, father_name, mother_name, parent_phone) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING student_code
        `;
        const values = [prefix, first_name, last_name, dob, phone, department_id, student_code, hash, level, blood_group, student_image, father_name, mother_name, parent_phone];
        
        await db.query(query, values);
        res.json({ success: true, message: 'ลงทะเบียนสำเร็จ', student_code: student_code });

    } catch (err) {
        if (err.message.includes('unique constraint') || err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'รหัสนักศึกษานี้มีอยู่ในระบบแล้ว' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Student Login
router.post('/login/student', async (req, res) => {
    let { student_code, password } = req.body;
    
    // Normalize Input Password to DD/MM/YYYY
    console.log(`Login attempt for: ${student_code}, Raw Pwd: ${password}`);

    if (password) {
        let cleanPwd = password.replace(/[^0-9\/]/g, '');
        if (cleanPwd.includes('/')) {
            const parts = cleanPwd.split('/');
            if (parts.length === 3) {
                const d = parts[0].padStart(2, '0');
                const m = parts[1].padStart(2, '0');
                const y = parts[2];
                cleanPwd = `${d}/${m}/${y}`;
            }
        } else if (cleanPwd.length === 8) {
            const d = cleanPwd.substring(0, 2);
            const m = cleanPwd.substring(2, 4);
            const y = cleanPwd.substring(4, 8);
            cleanPwd = `${d}/${m}/${y}`;
        }
        password = cleanPwd;
    }
    console.log(`Normalized Pwd: ${password}`);
    
    try {
        const result = await db.query("SELECT * FROM students WHERE student_code = $1", [student_code]);
        const row = result.rows[0];

        if (!row) return res.status(401).json({ error: 'ไม่พบข้อมูลนักศึกษา' }); // User not found
        
        const match = await bcrypt.compare(password, row.password);
        if (match) {
            req.session.userId = row.student_id;
            req.session.role = 'student';
            req.session.userName = row.first_name + ' ' + row.last_name;
            req.session.studentCode = row.student_code;
            return res.json({ success: true, redirect: '/student_dashboard.html' });
        } else {
            return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง (วันเกิด DDMMYYYY)' }); // Invalid password
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Login
router.post('/login/admin', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const result = await db.query("SELECT * FROM admin_users WHERE username = $1", [username]);
        const row = result.rows[0];

        if (!row) return res.status(401).json({ error: 'ไม่พบผู้ดูแลระบบ' });
        
        const match = await bcrypt.compare(password, row.password);
        if (match) {
            req.session.userId = row.admin_id;
            req.session.role = 'admin';
            req.session.userName = row.username;
            return res.json({ success: true, redirect: '/admin_dashboard.html' });
        } else {
            return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'Could not log out' });
        res.json({ success: true, redirect: '/index.html' });
    });
});

module.exports = router;
