/**
 * Migration Script: Add Advisors and Student Groups tables
 * 
 * Tables created:
 * - advisors: รายชื่อครูที่ปรึกษา
 * - student_groups: กลุ่มเรียนพร้อมครูที่รับผิดชอบ
 * 
 * Columns added to students:
 * - group_id: อ้างอิงไปยัง student_groups
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

async function migrate() {
    console.log('🚀 Starting migration: Adding Advisors and Student Groups...');
    
    try {
        // 1. Create advisors table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS advisors (
                advisor_id SERIAL PRIMARY KEY,
                advisor_name TEXT NOT NULL,
                advisor_type TEXT DEFAULT 'group',
                department_id INTEGER REFERENCES departments(department_id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created advisors table');

        // 2. Create student_groups table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS student_groups (
                group_id SERIAL PRIMARY KEY,
                group_name TEXT NOT NULL UNIQUE,
                level TEXT,
                department_id INTEGER REFERENCES departments(department_id),
                group_advisor_id INTEGER REFERENCES advisors(advisor_id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created student_groups table');

        // 3. Add group_id to students table (if not exists)
        await pool.query(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES student_groups(group_id)
        `);
        console.log('✅ Added group_id column to students');

        console.log('🎉 Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
