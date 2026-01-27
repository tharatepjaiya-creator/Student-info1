/**
 * Migration Script: Add student_group column
 * 
 * Adds a column to store the group name (e.g., E1, E2, TC3) directly on the students table
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    console.log('🚀 Starting migration: Adding student_group column...');
    
    try {
        // Add student_group column if not exists
        await pool.query(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS student_group TEXT
        `);
        console.log('✅ Added student_group column');
        
        console.log('🎉 Migration completed successfully!');
        
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
