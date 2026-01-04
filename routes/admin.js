const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const bcrypt = require('bcryptjs');
const os = require('os');

// Use /tmp on Vercel (read-only filesystem otherwise), or local uploads folder
const isProduction = process.env.NODE_ENV === 'production';
const uploadDir = isProduction ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)){
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (err) {
        console.error('Failed to create upload directory:', err);
    }
}

// Configure Multer for Admin Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); 
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

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
router.get('/students', async (req, res) => {
    const query = `
        SELECT s.*, d.department_name 
        FROM students s 
        LEFT JOIN departments d ON s.department_id = d.department_id
        ORDER BY s.student_id DESC`;
    try {
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Single Student by ID
router.get('/students/:id', async (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT s.*, d.department_name 
        FROM students s 
        LEFT JOIN departments d ON s.department_id = d.department_id 
        WHERE s.student_id = $1`;
    try {
        const result = await db.query(query, [id]);
        const row = result.rows[0];
        if (!row) return res.status(404).json({ error: 'Student not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Student
router.delete('/students/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("DELETE FROM students WHERE student_id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset Student Password (to DOB)
router.post('/students/:id/reset-password', async (req, res) => {
    const { id } = req.params;
    
    try {
        // First retrieve DOB
        const result = await db.query("SELECT dob FROM students WHERE student_id = $1", [id]);
        const row = result.rows[0];
        
        if (!row) return res.status(404).json({ error: 'Student not found' });
        
        const passwordRaw = row.dob.split('-').reverse().join('');
        const saltRounds = 10;
        
        const hash = await bcrypt.hash(passwordRaw, saltRounds);
        await db.query("UPDATE students SET password = $1 WHERE student_id = $2", [hash, id]);
        
        res.json({ success: true, message: 'Password reset to DOB (DDMMYYYY)' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Student Details
router.put('/students/:id', async (req, res) => {
    const { id } = req.params;
    const { prefix, first_name, last_name, level, department_id, dob, blood_group, phone, father_name, mother_name, parent_phone } = req.body;

    const query = `
        UPDATE students 
        SET prefix = $1, first_name = $2, last_name = $3, level = $4, department_id = $5, dob = $6, 
            blood_group = $7, phone = $8, father_name = $9, mother_name = $10, parent_phone = $11
        WHERE student_id = $12`;
        
    const params = [prefix, first_name, last_name, level, department_id, dob, blood_group, phone, father_name, mother_name, parent_phone, id];

    try {
        await db.query(query, params);
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Change Student Password (Custom)
router.post('/students/:id/change-password', async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'Password too short' });
    }

    const saltRounds = 10;
    try {
        const hash = await bcrypt.hash(newPassword, saltRounds);
        await db.query("UPDATE students SET password = $1 WHERE student_id = $2", [hash, id]);
        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload/Update Student Image (Admin Only)
router.post('/students/:id/upload-image', upload.single('student_image'), async (req, res) => {
    const studentId = req.params.id;
    const student_image = req.file ? `/uploads/${req.file.filename}` : null;

    if (!student_image) {
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพ' });
    }

    try {
        // Get old image to delete
        const result = await db.query("SELECT student_image FROM students WHERE student_id = $1", [studentId]);
        const row = result.rows[0];

        if (row && row.student_image) {
            // Try to delete old file
            const oldPath = path.join(__dirname, '..', row.student_image);
            if (fs.existsSync(oldPath)) {
                fs.unlink(oldPath, () => {});
            }
        }

        await db.query("UPDATE students SET student_image = $1 WHERE student_id = $2", [student_image, studentId]);
        res.json({ success: true, message: 'อัปเดตบรูปภาพสำเร็จ', imagePath: student_image });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Departments Management ---

// Get Departments
router.get('/departments', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM departments");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Department
router.post('/departments', async (req, res) => {
    const { name, code } = req.body;
    try {
        // Postgres returns insert id via RETURNING
        const result = await db.query("INSERT INTO departments (department_name, code) VALUES ($1, $2) RETURNING department_id", [name, code]);
        res.json({ success: true, id: result.rows[0].department_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Department
router.delete('/departments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("DELETE FROM departments WHERE department_id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Announcements Management ---

// Post Announcement (with Image)
router.post('/announcements', upload.single('image'), async (req, res) => {
    const { title, content, department_id } = req.body;
    const imagePath = req.file ? '/uploads/' + req.file.filename : null;
    
    // Convert empty string to null for general announcements
    const deptId = (department_id === '' || department_id === 'null' || !department_id) ? null : department_id;

    try {
        await db.query("INSERT INTO announcements (title, content, image, department_id) VALUES ($1, $2, $3, $4)", 
            [title, content, imagePath, deptId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Announcements (Filter by Dept or All)
router.get('/announcements', async (req, res) => {
    const { department_id } = req.query;
    let query = "SELECT a.*, d.department_name FROM announcements a LEFT JOIN departments d ON a.department_id = d.department_id ORDER BY created_at DESC";
    let params = [];
    
    if (department_id) {
        query = "SELECT a.*, d.department_name FROM announcements a LEFT JOIN departments d ON a.department_id = d.department_id WHERE a.department_id = $1 ORDER BY created_at DESC";
        params = [department_id];
    }
    
    try {
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Announcement
router.delete('/announcements/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("DELETE FROM announcements WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dashboard Stats
router.get('/stats', async (req, res) => {
    const stats = {};
    try {
        const studentRes = await db.query("SELECT count(*) as count FROM students");
        stats.students = studentRes.rows[0].count;
        
        const deptRes = await db.query("SELECT count(*) as count FROM departments");
        stats.departments = deptRes.rows[0].count;

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

// Force Seed Departments (Temporary Fix)
router.post('/force-seed-departments', async (req, res) => {
    try {
        const depts = [
            ["เทคโนโลยีคอมพิวเตอร์", "COM"],
            ["อิเล็กทรอนิกส์", "ELEC"],
            ["ช่างไฟฟ้ากำลัง", "POWER"],
            ["เทคโนโลยีสารสนเทศ", "IT"],
            ["ช่างโยธา", "CIVIL"],
            ["ช่างก่อสร้าง", "CONST"],
            ["ช่างเชื่อม", "WELD"],
            ["ช่างเมคคาทรอนิกส์", "MECHA"],
            ["ช่างยนต์", "AUTO"],
            ["ช่างกลโรงงาน", "MECHANIC"]
        ];
        
        let added = 0;
        for (const [name, code] of depts) {
            const result = await db.query(`
                INSERT INTO departments (department_name, code) 
                SELECT $1, $2 
                WHERE NOT EXISTS (
                    SELECT 1 FROM departments WHERE department_name = $1
                )
                RETURNING department_id
            `, [name, code]);
            
            if (result.rows.length > 0) {
                added++;
            }
        }
        
        res.json({ success: true, message: `Added ${added} new departments`, total: depts.length });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// Rename Department (ช่างเครื่องกลโรงงาน -> ช่างกลโรงงาน)
router.post('/rename-department', async (req, res) => {
    try {
        console.log('🔄 Starting department rename...');
        
        // First, check if old department exists
        const checkOld = await db.query(
            "SELECT * FROM departments WHERE department_name = 'ช่างเครื่องกลโรงงาน'"
        );
        
        if (checkOld.rows.length === 0) {
            return res.json({ 
                success: true, 
                message: 'ไม่พบแผนก "ช่างเครื่องกลโรงงาน" ในฐานข้อมูล อาจได้รับการเปลี่ยนชื่อไปแล้ว',
                alreadyUpdated: true
            });
        }
        
        // Update the department name
        const result = await db.query(`
            UPDATE departments 
            SET department_name = 'ช่างกลโรงงาน'
            WHERE department_name = 'ช่างเครื่องกลโรงงาน'
            RETURNING department_id, department_name, code
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ Department renamed successfully:', result.rows[0]);
            res.json({ 
                success: true, 
                message: 'เปลี่ยนชื่อแผนกสำเร็จ จาก "ช่างเครื่องกลโรงงาน" เป็น "ช่างกลโรงงาน"',
                department: result.rows[0]
            });
        } else {
            res.json({ 
                success: false, 
                error: 'ไม่สามารถเปลี่ยนชื่อแผนกได้' 
            });
        }
    } catch (err) {
        console.error('❌ Error renaming department:', err);
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

module.exports = router;
