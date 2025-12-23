const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const uploadDir = 'd:/studentinfoweb/uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Configure Multer for Admin Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Use absolute path
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ... existing code ...

// Create Student (Admin)
// ...

// Upload/Update Student Image (Admin Only)
router.post('/students/:id/upload-image', upload.single('student_image'), (req, res) => {
    const studentId = req.params.id;
    const student_image = req.file ? `/uploads/${req.file.filename}` : null;

    if (!student_image) {
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพ' });
    }

    // Get old image to delete
    db.get("SELECT student_image FROM students WHERE student_id = ?", [studentId], (err, row) => {
        if (!err && row && row.student_image) {
            // Try to delete old file
            const oldPath = path.join(__dirname, '..', row.student_image);
            if (fs.existsSync(oldPath)) {
                fs.unlink(oldPath, () => {});
            }
        }
    });

    const stmt = db.prepare("UPDATE students SET student_image = ? WHERE student_id = ?");
    stmt.run(student_image, studentId, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'อัปเดตบรูปภาพสำเร็จ', imagePath: student_image });
    });
    stmt.finalize();
});
const bcrypt = require('bcrypt');

// Middleware to check if user is admin
function isAdmin(req, res, next) {
    if (req.session.role === 'admin' && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(isAdmin);

// --- Students Management ---

// Get All Students
router.get('/students', (req, res) => {
    const query = `
        SELECT s.*, d.department_name 
        FROM students s 
        LEFT JOIN departments d ON s.department_id = d.department_id
        ORDER BY s.student_id DESC`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get Single Student by ID
router.get('/students/:id', (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT s.*, d.department_name 
        FROM students s 
        LEFT JOIN departments d ON s.department_id = d.department_id 
        WHERE s.student_id = ?`;
    db.get(query, [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Student not found' });
        res.json(row);
    });
});

// Delete Student
router.delete('/students/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM students WHERE student_id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Reset Student Password (to DOB)
router.post('/students/:id/reset-password', (req, res) => {
    const { id } = req.params;
    
    // First retrieve DOB
    db.get("SELECT dob FROM students WHERE student_id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Student not found' });
        
        const passwordRaw = row.dob.split('-').reverse().join('');
        const saltRounds = 10;
        
        bcrypt.hash(passwordRaw, saltRounds, (err, hash) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.run("UPDATE students SET password = ? WHERE student_id = ?", [hash, id], function(err) {
                 if (err) return res.status(500).json({ error: err.message });
                 res.json({ success: true, message: 'Password reset to DOB (DDMMYYYY)' });
            });
        });
    });
});

// Update Student Details
router.put('/students/:id', (req, res) => {
    const { id } = req.params;
    const { prefix, first_name, last_name, level, department_id, dob, blood_group, phone, father_name, mother_name, parent_phone } = req.body;

    const query = `
        UPDATE students 
        SET prefix = ?, first_name = ?, last_name = ?, level = ?, department_id = ?, dob = ?, 
            blood_group = ?, phone = ?, father_name = ?, mother_name = ?, parent_phone = ?
        WHERE student_id = ?`;
        
    const params = [prefix, first_name, last_name, level, department_id, dob, blood_group, phone, father_name, mother_name, parent_phone, id];

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    });
});

// Change Student Password (Custom)
router.post('/students/:id/change-password', (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'Password too short' });
    }

    const saltRounds = 10;
    bcrypt.hash(newPassword, saltRounds, (err, hash) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run("UPDATE students SET password = ? WHERE student_id = ?", [hash, id], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
        });
    });
});

// --- Departments Management ---

// Get Departments
router.get('/departments', (req, res) => {
    db.all("SELECT * FROM departments", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Add Department
router.post('/departments', (req, res) => {
    const { name, code } = req.body;
    db.run("INSERT INTO departments (department_name, code) VALUES (?, ?)", [name, code], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// Delete Department
router.delete('/departments/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM departments WHERE department_id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- Announcements Management ---
// Multer config moved to top

// Post Announcement (with Image)
router.post('/announcements', upload.single('image'), (req, res) => {
    const { title, content, department_id } = req.body;
    const imagePath = req.file ? '/uploads/' + req.file.filename : null;
    
    // Convert empty string to null for general announcements
    const deptId = (department_id === '' || department_id === 'null' || !department_id) ? null : department_id;

    db.run("INSERT INTO announcements (title, content, image, department_id) VALUES (?, ?, ?, ?)", 
        [title, content, imagePath, deptId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Get Announcements (Filter by Dept or All)
router.get('/announcements', (req, res) => {
    const { department_id } = req.query;
    let query = "SELECT a.*, d.department_name FROM announcements a LEFT JOIN departments d ON a.department_id = d.department_id ORDER BY created_at DESC";
    let params = [];
    
    if (department_id) {
        query = "SELECT a.*, d.department_name FROM announcements a LEFT JOIN departments d ON a.department_id = d.department_id WHERE a.department_id = ? ORDER BY created_at DESC";
        params = [department_id];
    }
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Delete Announcement
router.delete('/announcements/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM announcements WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Dashboard Stats
router.get('/stats', (req, res) => {
    const stats = {};
    db.get("SELECT count(*) as count FROM students", (err, row) => {
        if (err) return res.status(500).json({ error: err });
        stats.students = row.count;
        
        db.get("SELECT count(*) as count FROM departments", (err, row) => {
            if (err) return res.status(500).json({ error: err });
            stats.departments = row.count;

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
});

module.exports = router;
