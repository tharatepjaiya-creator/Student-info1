const express = require('express');
const router = express.Router();
const db = require('../database');

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
        SELECT s.*, d.department_name, d.code as dept_code 
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

module.exports = router;
