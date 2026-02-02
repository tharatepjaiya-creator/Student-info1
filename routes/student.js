const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { upload } = require('./cloudinary');

// Middleware to check if user is student
function isAuthenticated(req, res, next) {
    if (req.session.role === 'student' && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
}

// Get Student Info
router.get('/info', isAuthenticated, async (req, res) => {
    const studentId = req.session.userId;
    const query = `
        SELECT s.*, d.department_name, d.code as dept_code, s.student_group as group_name 
        FROM students s 
        LEFT JOIN departments d ON s.department_id = d.department_id 
        WHERE s.student_id = $1`;
        
    try {
        const result = await db.query(query, [studentId]);
        const row = result.rows[0];

        if (!row) return res.status(404).json({ error: 'Student not found' });
        
        // Remove password from response
        delete row.password; 
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Announcements for Student's Department
router.get('/announcements', isAuthenticated, async (req, res) => {
    const studentId = req.session.userId;
    
    try {
        // First get student's department_id
        const studentRes = await db.query("SELECT department_id FROM students WHERE student_id = $1", [studentId]);
        const student = studentRes.rows[0];
        
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const deptId = student.department_id;

        const query = `
            SELECT a.*, d.department_name 
            FROM announcements a 
            LEFT JOIN departments d ON a.department_id = d.department_id 
            WHERE a.department_id = $1 OR a.department_id IS NULL
            ORDER BY created_at DESC`;
            
        const result = await db.query(query, [deptId]);
        res.json(result.rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Student's Own Info (Limited Fields)
router.put('/update', isAuthenticated, async (req, res) => {
    const studentId = req.session.userId;
    const { blood_group, phone, parent_phone } = req.body;
    
    try {
        await db.query(
            `UPDATE students 
             SET blood_group = $1, phone = $2, parent_phone = $3 
             WHERE student_id = $4`,
            [blood_group, phone, parent_phone, studentId]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Change Student's Own Password
router.put('/change-password', isAuthenticated, async (req, res) => {
    const studentId = req.session.userId;
    const { newPassword, confirmPassword } = req.body;

    // Validate inputs
    if (!newPassword || !confirmPassword) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'รหัสผ่านใหม่ไม่ตรงกัน' });
    }

    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
    }

    try {
        // Hash new password and update
        const saltRounds = 10;
        const hash = await bcrypt.hash(newPassword, saltRounds);
        await db.query(
            'UPDATE students SET password = $1 WHERE student_id = $2',
            [hash, studentId]
        );

        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload/Update Student's Own Profile Image
router.post('/upload-image', isAuthenticated, upload.single('student_image'), async (req, res) => {
    const studentId = req.session.userId;
    const student_image = req.file ? req.file.path : null; // Cloudinary URL

    if (!student_image) {
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพ' });
    }

    try {
        await db.query(
            'UPDATE students SET student_image = $1 WHERE student_id = $2',
            [student_image, studentId]
        );
        res.json({ success: true, message: 'อัปโหลดรูปโปรไฟล์สำเร็จ', image_url: student_image });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================
// ATTENDANCE ROUTES
// ============================

// Get Student's Own Attendance Records
router.get('/attendance', isAuthenticated, async (req, res) => {
    const studentId = req.session.userId;
    const { semester } = req.query;
    
    try {
        let query = `
            SELECT a.*, t.full_name as teacher_name
            FROM attendance_records a
            LEFT JOIN teacher_advisors t ON a.teacher_id = t.teacher_id
            WHERE a.student_id = $1
        `;
        const params = [studentId];
        
        if (semester) {
            query += ` AND a.semester = $2`;
            params.push(semester);
        }
        
        query += ` ORDER BY a.check_date DESC`;
        
        const result = await db.query(query, params);
        res.json(result.rows);
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Student's Attendance Summary
router.get('/attendance/summary', isAuthenticated, async (req, res) => {
    const studentId = req.session.userId;
    
    try {
        // Get student's level to determine max weeks
        const studentResult = await db.query(
            'SELECT level FROM students WHERE student_id = $1',
            [studentId]
        );
        const student = studentResult.rows[0];
        const maxWeeks = student && student.level && student.level.startsWith('ปวส') ? 15 : 18;
        
        // Get attendance summary
        const result = await db.query(`
            SELECT 
                check_type,
                COUNT(*) as total_checks,
                COUNT(CASE WHEN is_present THEN 1 END) as present_count
            FROM attendance_records
            WHERE student_id = $1
            GROUP BY check_type
        `, [studentId]);
        
        const summary = {
            wednesday: { present: 0, total: 0, maxWeeks, percentage: 0 },
            thursday: { present: 0, total: 0, maxWeeks, percentage: 0 }
        };
        
        result.rows.forEach(row => {
            if (summary[row.check_type]) {
                summary[row.check_type].present = parseInt(row.present_count);
                summary[row.check_type].total = parseInt(row.total_checks);
                summary[row.check_type].percentage = Math.round((parseInt(row.present_count) / maxWeeks) * 100);
            }
        });
        
        res.json({
            summary,
            level: student?.level || 'ปวช.',
            maxWeeks
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

