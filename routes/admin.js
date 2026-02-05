const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const { upload } = require('./cloudinary');

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
    const { prefix, first_name, last_name, level, department_id, dob, blood_group, phone, father_name, mother_name, parent_phone, academic_status, group_advisor, department_advisor, gpa, national_id } = req.body;

    const query = `
        UPDATE students 
        SET prefix = $1, first_name = $2, last_name = $3, level = $4, department_id = $5, dob = $6, 
            blood_group = $7, phone = $8, father_name = $9, mother_name = $10, parent_phone = $11,
            academic_status = $12, group_advisor = $13, department_advisor = $14, gpa = $15, national_id = $16
        WHERE student_id = $17`;
        
    const params = [prefix, first_name, last_name, level, department_id, dob, blood_group, phone, father_name, mother_name, parent_phone, academic_status, group_advisor, department_advisor, gpa, national_id, id];

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
    const student_image = req.file ? req.file.path : null; // Cloudinary URL

    if (!student_image) {
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพ' });
    }

    try {
        // No need to delete old image from Cloudinary, it just gets replaced
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
    const imagePath = req.file ? req.file.path : null; // Cloudinary URL
    
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

// =============================================
// --- ADVISOR MANAGEMENT ---
// =============================================

// Get All Advisors
router.get('/advisors', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT a.*, d.department_name 
            FROM advisors a 
            LEFT JOIN departments d ON a.department_id = d.department_id
            ORDER BY a.advisor_name
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add New Advisor
router.post('/advisors', async (req, res) => {
    const { advisor_name, advisor_type, department_id } = req.body;
    
    if (!advisor_name || advisor_name.trim() === '') {
        return res.status(400).json({ error: 'กรุณาระบุชื่อครูที่ปรึกษา' });
    }
    
    try {
        const result = await db.query(
            `INSERT INTO advisors (advisor_name, advisor_type, department_id) 
             VALUES ($1, $2, $3) RETURNING *`,
            [advisor_name.trim(), advisor_type || 'group', department_id || null]
        );
        res.json({ success: true, advisor: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Advisor
router.delete('/advisors/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // First, remove advisor from any groups
        await db.query(`UPDATE student_groups SET group_advisor_id = NULL WHERE group_advisor_id = $1`, [id]);
        // Then delete the advisor
        await db.query(`DELETE FROM advisors WHERE advisor_id = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// --- STUDENT GROUPS MANAGEMENT ---
// =============================================

// Get Groups by Department (5 groups per level, 5 levels per department)
// This endpoint generates 25 groups for ALL departments (5 levels x 5 groups)
router.get('/groups-by-department', async (req, res) => {
    try {
        // Get ALL departments
        const allDepts = await db.query(`
            SELECT department_id, department_name, code
            FROM departments
            ORDER BY department_name
        `);
        
        // Levels with Thai abbreviations
        const levels = [
            { name: 'ปวช.1', code: '1', abbr: 'ช.1' },
            { name: 'ปวช.2', code: '2', abbr: 'ช.2' },
            { name: 'ปวช.3', code: '3', abbr: 'ช.3' },
            { name: 'ปวส.1', code: '4', abbr: 'ส.1' },
            { name: 'ปวส.2', code: '5', abbr: 'ส.2' }
        ];
        
        // Generate 5 groups per level for each department
        const groups = [];
        for (const dept of allDepts.rows) {
            const deptCode = dept.code || 'DEPT';
            
            for (const level of levels) {
                for (let i = 1; i <= 5; i++) {
                    const groupName = `${deptCode}${level.abbr}-กลุ่ม${i}`; // e.g., TCช.1-กลุ่ม1, TCส.2-กลุ่ม1
                    groups.push({
                        group_id: `${dept.department_id}_${level.code}_${i}`, // Virtual group ID
                        group_name: groupName,
                        group_display: `กลุ่ม ${groupName}`,
                        department_id: dept.department_id,
                        department_name: dept.department_name,
                        department_code: deptCode,
                        level: level.name,
                        level_code: level.code,
                        group_number: i
                    });
                }
            }
        }
        
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DEPRECATED: Old groups endpoint - now using virtual groups from /groups-by-department

// DEPRECATED: Manual group creation removed - groups are now virtual


// DEPRECATED: Old assign advisor by ID - now using /groups/assign-advisor-by-name


// Assign Advisor to Group by Group Name (for new virtual groups like E1, TC2)
router.put('/groups/assign-advisor-by-name', async (req, res) => {
    const { group_name, advisor_id } = req.body;
    
    try {
        // Get advisor name and update teacher's assigned_groups
        let advisorName = null;
        let teacherId = null;
        
        if (advisor_id) {
            // Check if it's a registered teacher (prefixed with T-)
            if (String(advisor_id).startsWith('T-')) {
                teacherId = advisor_id.substring(2);
                const teacherResult = await db.query(`SELECT teacher_id, full_name, assigned_groups FROM teacher_advisors WHERE teacher_id = $1`, [teacherId]);
                if (teacherResult.rows[0]) {
                    advisorName = teacherResult.rows[0].full_name;
                    
                    // Update teacher's assigned_groups to include this group
                    let currentGroups = teacherResult.rows[0].assigned_groups || '';
                    let groupsArray = currentGroups.split(',').map(g => g.trim()).filter(g => g);
                    
                    // Add the new group if not already present
                    if (!groupsArray.includes(group_name)) {
                        groupsArray.push(group_name);
                    }
                    
                    // Update teacher's assigned_groups
                    await db.query(
                        `UPDATE teacher_advisors SET assigned_groups = $1 WHERE teacher_id = $2`,
                        [groupsArray.join(','), teacherId]
                    );
                }
            } else {
                // Legacy advisor table
                const advisorResult = await db.query(`SELECT advisor_name FROM advisors WHERE advisor_id = $1`, [advisor_id]);
                if (advisorResult.rows[0]) {
                    advisorName = advisorResult.rows[0].advisor_name;
                }
            }
        }
        
        // If clearing the assignment (advisor_id is empty), remove the group from all teachers
        if (!advisor_id || advisor_id === '') {
            // Find who was previously assigned and remove this group from their list
            const prevTeachers = await db.query(
                `SELECT teacher_id, assigned_groups FROM teacher_advisors WHERE assigned_groups LIKE $1`,
                [`%${group_name}%`]
            );
            
            for (const teacher of prevTeachers.rows) {
                let groupsArray = teacher.assigned_groups.split(',').map(g => g.trim()).filter(g => g && g !== group_name);
                await db.query(
                    `UPDATE teacher_advisors SET assigned_groups = $1 WHERE teacher_id = $2`,
                    [groupsArray.join(',') || null, teacher.teacher_id]
                );
            }
        }
        
        // Update all students with this group name
        const updateResult = await db.query(
            `UPDATE students SET group_advisor = $1 WHERE student_group = $2`,
            [advisorName, group_name]
        );
        
        const updatedCount = updateResult.rowCount;
        
        res.json({ 
            success: true, 
            message: `อัปเดตครูที่ปรึกษากลุ่ม ${group_name} สำเร็จ (นักศึกษา ${updatedCount} คน)`,
            updated_students: updatedCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get current advisor assignments for all groups
router.get('/groups/advisor-assignments', async (req, res) => {
    try {
        // Get distinct group_advisor for each student_group
        const result = await db.query(`
            SELECT DISTINCT student_group, group_advisor 
            FROM students 
            WHERE student_group IS NOT NULL AND group_advisor IS NOT NULL AND group_advisor != ''
        `);
        
        // Also get teacher_advisors with their assigned_groups
        const teacherResult = await db.query(`
            SELECT teacher_id, full_name, assigned_groups 
            FROM teacher_advisors 
            WHERE is_approved = TRUE AND assigned_groups IS NOT NULL
        `);
        
        // Build a map of group_name -> advisor info
        const assignments = {};
        
        // From students table
        result.rows.forEach(row => {
            if (row.student_group && row.group_advisor) {
                assignments[row.student_group] = {
                    advisor_name: row.group_advisor,
                    source: 'students'
                };
            }
        });
        
        // From teacher_advisors table (overwrite if exists - more authoritative)
        teacherResult.rows.forEach(teacher => {
            if (teacher.assigned_groups) {
                const groups = teacher.assigned_groups.split(',').map(g => g.trim());
                groups.forEach(groupName => {
                    if (groupName) {
                        assignments[groupName] = {
                            teacher_id: teacher.teacher_id,
                            advisor_name: teacher.full_name,
                            source: 'teacher_advisors'
                        };
                    }
                });
            }
        });
        
        res.json(assignments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DEPRECATED: Sync functionality removed - groups are now virtual and don't need syncing


// Assign Student to Group (stores group name like E1, E2, TC3)
router.put('/students/:id/assign-group', async (req, res) => {
    const { id } = req.params;
    const { group_id } = req.body; // This is now the group_name (e.g., E1, TC3)
    
    try {
        // Update student's group name
        await db.query(
            `UPDATE students SET student_group = $1 WHERE student_id = $2`,
            [group_id || null, id]
        );
        
        res.json({ success: true, message: 'อัปเดตกลุ่มสำเร็จ' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// --- TEACHER ADVISOR (LOGIN) MANAGEMENT ---
// =============================================

// Get All Teacher Advisors
router.get('/teacher-advisors', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT t.*, d.department_name 
            FROM teacher_advisors t 
            LEFT JOIN departments d ON t.department_id = d.department_id
            ORDER BY t.is_approved ASC, t.created_at DESC
        `);
        
        // Remove passwords from response
        const teachers = result.rows.map(t => {
            delete t.password;
            return t;
        });
        
        res.json(teachers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Pending Teacher Advisors (Not Approved)
router.get('/teacher-advisors/pending', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT t.*, d.department_name 
            FROM teacher_advisors t 
            LEFT JOIN departments d ON t.department_id = d.department_id
            WHERE t.is_approved = FALSE
            ORDER BY t.created_at ASC
        `);
        
        const teachers = result.rows.map(t => {
            delete t.password;
            return t;
        });
        
        res.json(teachers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve Teacher
router.post('/teacher-advisors/:id/approve', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE teacher_advisors SET is_approved = TRUE WHERE teacher_id = $1', [id]);
        res.json({ success: true, message: 'อนุมัติครูที่ปรึกษาเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Teacher Advisor Info
router.put('/teacher-advisors/:id', async (req, res) => {
    const { id } = req.params;
    const { full_name, phone, email, department_id, assigned_groups, is_approved } = req.body;
    
    try {
        await db.query(`
            UPDATE teacher_advisors 
            SET full_name = $1, phone = $2, email = $3, department_id = $4, assigned_groups = $5, is_approved = $6
            WHERE teacher_id = $7
        `, [full_name, phone || null, email || null, department_id || null, assigned_groups || null, is_approved, id]);
        
        res.json({ success: true, message: 'อัปเดตข้อมูลครูที่ปรึกษาเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Assign Groups to Teacher
router.post('/teacher-advisors/:id/assign-groups', async (req, res) => {
    const { id } = req.params;
    const { assigned_groups } = req.body;
    
    try {
        await db.query(
            'UPDATE teacher_advisors SET assigned_groups = $1 WHERE teacher_id = $2',
            [assigned_groups || null, id]
        );
        
        res.json({ success: true, message: 'กำหนดกลุ่มให้ครูที่ปรึกษาเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Teacher Advisor
router.delete('/teacher-advisors/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM teacher_advisors WHERE teacher_id = $1', [id]);
        res.json({ success: true, message: 'ลบครูที่ปรึกษาเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

