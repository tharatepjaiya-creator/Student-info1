// Migration to add teacher_image column to teacher_advisors table
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
        console.log('🚀 Starting migration: Add teacher_image column...');
        
        // Add teacher_image column if not exists
        await pool.query(`
            ALTER TABLE teacher_advisors 
            ADD COLUMN IF NOT EXISTS teacher_image TEXT
        `);
        
        console.log('✅ teacher_image column added successfully!');
        
        // Verify column
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'teacher_advisors' AND column_name = 'teacher_image'
        `);
        
        if (result.rows.length > 0) {
            console.log('📋 Column verified:', result.rows[0]);
        }
        
        console.log('🎉 Migration completed!');
        process.exit(0);
        
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
