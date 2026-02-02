// Migration to add teacher_advisors table
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
        console.log('🚀 Starting migration: Add teacher_advisors table...');
        
        // Create teacher_advisors table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teacher_advisors (
                teacher_id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                full_name TEXT NOT NULL,
                phone TEXT,
                email TEXT,
                is_approved BOOLEAN DEFAULT FALSE,
                assigned_groups TEXT,
                department_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (department_id) REFERENCES departments (department_id)
            )
        `);
        
        console.log('✅ teacher_advisors table created successfully!');
        
        // Verify table
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'teacher_advisors'
            ORDER BY ordinal_position
        `);
        
        console.log('📋 Table columns:');
        result.rows.forEach(row => {
            console.log(`   - ${row.column_name}: ${row.data_type}`);
        });
        
        console.log('🎉 Migration completed!');
        process.exit(0);
        
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
