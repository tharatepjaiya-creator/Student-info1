// Migration to create attendance_records table
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

async function migrate() {
    try {
        console.log('🚀 Starting migration: Create attendance_records table...');
        
        // Create attendance_records table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS attendance_records (
                id SERIAL PRIMARY KEY,
                student_id INTEGER NOT NULL,
                teacher_id INTEGER NOT NULL,
                check_date DATE NOT NULL,
                check_type VARCHAR(20) NOT NULL,
                week_number INTEGER NOT NULL,
                semester VARCHAR(20),
                is_present BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(student_id, check_date, check_type),
                FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
                FOREIGN KEY (teacher_id) REFERENCES teacher_advisors(teacher_id) ON DELETE SET NULL
            )
        `);
        
        console.log('✅ attendance_records table created successfully!');
        
        // Create semesters table for semester management
        await pool.query(`
            CREATE TABLE IF NOT EXISTS semesters (
                id SERIAL PRIMARY KEY,
                semester_name VARCHAR(20) NOT NULL UNIQUE,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                is_active BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        console.log('✅ semesters table created successfully!');
        
        // Verify tables
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name IN ('attendance_records', 'semesters')
        `);
        
        console.log('📋 Created tables:', result.rows.map(r => r.table_name).join(', '));
        console.log('🎉 Migration completed!');
        process.exit(0);
        
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
