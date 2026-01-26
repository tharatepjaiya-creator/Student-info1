/**
 * Migration Script: Add student academic status, advisor fields, and GPA
 * Columns added:
 * - academic_status: สถานะภาพการเรียน (ปกติ, วิทยาทัณฑ์, พ้นสภาพ)
 * - group_advisor: ครูที่ปรึกษาประจำกลุ่ม
 * - department_advisor: ครูที่ปรึกษาประจำแผนก
 * - gpa: เกรดเฉลี่ย
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
    console.log('🚀 Starting migration: Adding academic_status, advisor fields, and GPA...');
    
    try {
        // Add academic_status column with default value 'ปกติ'
        await pool.query(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS academic_status TEXT DEFAULT 'ปกติ'
        `);
        console.log('✅ Added academic_status column');

        // Add group_advisor column
        await pool.query(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS group_advisor TEXT
        `);
        console.log('✅ Added group_advisor column');

        // Add department_advisor column
        await pool.query(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS department_advisor TEXT
        `);
        console.log('✅ Added department_advisor column');

        // Add GPA column
        await pool.query(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS gpa DECIMAL(3,2)
        `);
        console.log('✅ Added gpa column');

        console.log('🎉 Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
