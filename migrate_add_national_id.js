// Migration: Add national_id column to students table
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log('🔄 Starting migration: Add national_id column...');
    
    try {
        // Add national_id column if not exists
        await pool.query(`
            ALTER TABLE students 
            ADD COLUMN IF NOT EXISTS national_id TEXT
        `);
        
        console.log('✅ Migration complete: national_id column added successfully');
    } catch (err) {
        if (err.message.includes('already exists')) {
            console.log('ℹ️ Column national_id already exists, skipping...');
        } else {
            console.error('❌ Migration failed:', err.message);
        }
    } finally {
        await pool.end();
    }
}

migrate();
