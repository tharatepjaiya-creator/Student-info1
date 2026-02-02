const express = require('express');
const router = express.Router();
const db = require('../database');

// Middleware to check if user is teacher
function isTeacher(req, res, next) {
    if (req.session.role === 'teacher' && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
}

router.use(isTeacher);

// Get Teacher Profile
router.get('/profile', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT t.*, d.department_name 
            FROM teacher_advisors t 
            LEFT JOIN departments d ON t.department_id = d.department_id
            WHERE t.teacher_id = $1
        `, [req.session.userId]);
        
        const teacher = result.rows[0];
        if (!teacher) {
            return res.status(404).json({ error: 'ไม่พบข้อมูลครู' });
        }
        
        // Remove sensitive data
        delete teacher.password;
        
        res.json(teacher);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Students in Teacher's Assigned Groups
router.get('/students', async (req, res) => {
    try {
        // Get teacher's assigned groups
        const teacherResult = await db.query(
            'SELECT assigned_groups FROM teacher_advisors WHERE teacher_id = $1',
            [req.session.userId]
        );
        
        const teacher = teacherResult.rows[0];
        if (!teacher || !teacher.assigned_groups) {
            return res.json([]); // No assigned groups
        }
        
        // Parse assigned groups (comma-separated)
        const groups = teacher.assigned_groups.split(',').map(g => g.trim()).filter(g => g);
        
        if (groups.length === 0) {
            return res.json([]);
        }
        
        // Query students in these groups
        const placeholders = groups.map((_, i) => `$${i + 1}`).join(', ');
        const query = `
            SELECT s.*, d.department_name 
            FROM students s 
            LEFT JOIN departments d ON s.department_id = d.department_id
            WHERE s.student_group IN (${placeholders})
            ORDER BY s.student_group, s.first_name
        `;
        
        const result = await db.query(query, groups);
        res.json(result.rows);
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Teacher Stats (count of students)
router.get('/stats', async (req, res) => {
    try {
        const teacherResult = await db.query(
            'SELECT assigned_groups FROM teacher_advisors WHERE teacher_id = $1',
            [req.session.userId]
        );
        
        const teacher = teacherResult.rows[0];
        if (!teacher || !teacher.assigned_groups) {
            return res.json({ studentCount: 0, groups: [] });
        }
        
        const groups = teacher.assigned_groups.split(',').map(g => g.trim()).filter(g => g);
        
        if (groups.length === 0) {
            return res.json({ studentCount: 0, groups: [] });
        }
        
        const placeholders = groups.map((_, i) => `$${i + 1}`).join(', ');
        const countResult = await db.query(
            `SELECT COUNT(*) as count FROM students WHERE student_group IN (${placeholders})`,
            groups
        );
        
        res.json({
            studentCount: parseInt(countResult.rows[0].count),
            groups: groups
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload Teacher Profile Image
const { upload } = require('./cloudinary');

router.post('/upload-image', upload.single('teacher_image'), async (req, res) => {
    const teacherId = req.session.userId;
    const teacher_image = req.file ? req.file.path : null; // Cloudinary URL

    if (!teacher_image) {
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพ' });
    }

    try {
        await db.query("UPDATE teacher_advisors SET teacher_image = $1 WHERE teacher_id = $2", [teacher_image, teacherId]);
        res.json({ success: true, message: 'อัปเดตรูปภาพสำเร็จ', imagePath: teacher_image });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Teacher Profile
router.put('/update-profile', async (req, res) => {
    const teacherId = req.session.userId;
    const { phone, email } = req.body;

    try {
        await db.query(
            "UPDATE teacher_advisors SET phone = $1, email = $2 WHERE teacher_id = $3",
            [phone || null, email || null, teacherId]
        );
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =================================
// ATTENDANCE MANAGEMENT
// =================================

// Get check type for today (wednesday or thursday)
function getCheckType() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 3) return 'wednesday'; // Wednesday
    if (dayOfWeek === 4) return 'thursday';  // Thursday
    return null;
}

// Check if current time is within allowed range (7:40-8:10)
function isWithinCheckTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;
    const startTime = 7 * 60 + 40;  // 7:40
    const endTime = 8 * 60 + 10;    // 8:10
    return currentMinutes >= startTime && currentMinutes <= endTime;
}

// Get week number from semester start
function getWeekNumber(checkDate, semesterStart) {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const diff = new Date(checkDate) - new Date(semesterStart);
    return Math.floor(diff / oneWeek) + 1;
}

// Get today's attendance for teacher's groups
router.get('/attendance/today', async (req, res) => {
    const teacherId = req.session.userId;
    const today = new Date().toISOString().split('T')[0];
    const checkType = getCheckType();
    
    try {
        // Get teacher's assigned groups
        const teacherResult = await db.query(
            'SELECT assigned_groups FROM teacher_advisors WHERE teacher_id = $1',
            [teacherId]
        );
        
        const teacher = teacherResult.rows[0];
        if (!teacher || !teacher.assigned_groups) {
            return res.json({ students: [], checkType: null, canCheck: false });
        }
        
        const groups = teacher.assigned_groups.split(',').map(g => g.trim()).filter(g => g);
        if (groups.length === 0) {
            return res.json({ students: [], checkType: null, canCheck: false });
        }
        
        // Get students with today's attendance status
        const placeholders = groups.map((_, i) => `$${i + 1}`).join(', ');
        const studentsResult = await db.query(`
            SELECT s.student_id, s.student_code, s.prefix, s.first_name, s.last_name, 
                   s.student_group, s.level,
                   COALESCE(a.is_present, FALSE) as is_present,
                   a.id as attendance_id
            FROM students s
            LEFT JOIN attendance_records a ON s.student_id = a.student_id 
                AND a.check_date = $${groups.length + 1}
                AND a.check_type = $${groups.length + 2}
            WHERE s.student_group IN (${placeholders})
            ORDER BY s.student_group, s.student_code
        `, [...groups, today, checkType || 'none']);
        
        res.json({
            students: studentsResult.rows,
            checkType: checkType,
            checkTypeLabel: checkType === 'wednesday' ? 'วันพุธ (หน้าเสาธง)' : checkType === 'thursday' ? 'วันพฤหัสบดี (หน้าแผนก)' : null,
            canCheck: isWithinCheckTime() && checkType !== null,
            today: today,
            currentTime: new Date().toLocaleTimeString('th-TH')
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save attendance (check multiple students at once)
router.post('/attendance/check', async (req, res) => {
    const teacherId = req.session.userId;
    const { attendanceData, checkDate, checkType, weekNumber, semester } = req.body;
    // attendanceData: [{student_id: 1, is_present: true}, ...]
    
    // Validate check time (only during 7:40-8:10, unless editing retroactively)
    const today = new Date().toISOString().split('T')[0];
    const isToday = checkDate === today;
    
    if (isToday && !isWithinCheckTime()) {
        // Allow anyway if it's the correct day (Wed/Thu)
    }
    
    if (!checkType || !['wednesday', 'thursday'].includes(checkType)) {
        return res.status(400).json({ error: 'ประเภทการเช็คชื่อไม่ถูกต้อง' });
    }
    
    try {
        let savedCount = 0;
        
        for (const record of attendanceData) {
            // Use upsert (INSERT ... ON CONFLICT UPDATE)
            await db.query(`
                INSERT INTO attendance_records (student_id, teacher_id, check_date, check_type, week_number, semester, is_present, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (student_id, check_date, check_type) 
                DO UPDATE SET is_present = $7, teacher_id = $2, updated_at = NOW()
            `, [record.student_id, teacherId, checkDate, checkType, weekNumber || 1, semester || null, record.is_present]);
            
            savedCount++;
        }
        
        res.json({ 
            success: true, 
            message: `บันทึกการเช็คชื่อสำเร็จ ${savedCount} คน`,
            savedCount 
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get attendance history for a specific student
router.get('/attendance/history/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const { semester } = req.query;
    
    try {
        let query = `
            SELECT a.*, s.first_name, s.last_name, s.student_code, s.level
            FROM attendance_records a
            JOIN students s ON a.student_id = s.student_id
            WHERE a.student_id = $1
        `;
        const params = [studentId];
        
        if (semester) {
            query += ` AND a.semester = $2`;
            params.push(semester);
        }
        
        query += ` ORDER BY a.check_date DESC`;
        
        const result = await db.query(query, params);
        
        // Calculate summary
        const records = result.rows;
        const wednesdayPresent = records.filter(r => r.check_type === 'wednesday' && r.is_present).length;
        const wednesdayTotal = records.filter(r => r.check_type === 'wednesday').length;
        const thursdayPresent = records.filter(r => r.check_type === 'thursday' && r.is_present).length;
        const thursdayTotal = records.filter(r => r.check_type === 'thursday').length;
        
        // Get max weeks based on level
        const student = result.rows[0];
        const maxWeeks = student && student.level && student.level.startsWith('ปวส') ? 15 : 18;
        
        res.json({
            records: records,
            summary: {
                wednesday: { present: wednesdayPresent, total: wednesdayTotal, maxWeeks, percentage: wednesdayTotal > 0 ? Math.round(wednesdayPresent / maxWeeks * 100) : 0 },
                thursday: { present: thursdayPresent, total: thursdayTotal, maxWeeks, percentage: thursdayTotal > 0 ? Math.round(thursdayPresent / maxWeeks * 100) : 0 }
            }
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get attendance summary for all students in teacher's groups
router.get('/attendance/summary', async (req, res) => {
    const teacherId = req.session.userId;
    
    try {
        const teacherResult = await db.query(
            'SELECT assigned_groups FROM teacher_advisors WHERE teacher_id = $1',
            [teacherId]
        );
        
        const teacher = teacherResult.rows[0];
        if (!teacher || !teacher.assigned_groups) {
            return res.json([]);
        }
        
        const groups = teacher.assigned_groups.split(',').map(g => g.trim()).filter(g => g);
        if (groups.length === 0) {
            return res.json([]);
        }
        
        const placeholders = groups.map((_, i) => `$${i + 1}`).join(', ');
        
        // Get summary for each student
        const result = await db.query(`
            SELECT s.student_id, s.student_code, s.prefix, s.first_name, s.last_name, 
                   s.student_group, s.level,
                   COUNT(CASE WHEN a.check_type = 'wednesday' AND a.is_present THEN 1 END) as wed_present,
                   COUNT(CASE WHEN a.check_type = 'wednesday' THEN 1 END) as wed_total,
                   COUNT(CASE WHEN a.check_type = 'thursday' AND a.is_present THEN 1 END) as thu_present,
                   COUNT(CASE WHEN a.check_type = 'thursday' THEN 1 END) as thu_total
            FROM students s
            LEFT JOIN attendance_records a ON s.student_id = a.student_id
            WHERE s.student_group IN (${placeholders})
            GROUP BY s.student_id
            ORDER BY s.student_group, s.student_code
        `, groups);
        
        res.json(result.rows);
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =================================
// Public API for fetching teacher info (for students)
// =================================
const publicRouter = express.Router();

// Get Teacher Info by Name (Public - for students to view advisor)
publicRouter.get('/info-by-name/:name', async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        // Use ILIKE for partial matching since stored advisor name might be shorter than full_name
        const result = await db.query(`
            SELECT t.full_name, t.phone, t.email, t.teacher_image, d.department_name 
            FROM teacher_advisors t 
            LEFT JOIN departments d ON t.department_id = d.department_id
            WHERE (t.full_name = $1 OR t.full_name ILIKE $2 OR $1 ILIKE '%' || t.full_name || '%') 
              AND t.is_approved = TRUE
            LIMIT 1
        `, [name, `%${name}%`]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบข้อมูลครูที่ปรึกษา' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
module.exports.publicRouter = publicRouter;

