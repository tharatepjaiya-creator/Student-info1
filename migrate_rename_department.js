const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrateDepartmentName() {
    try {
        console.log('🔄 Starting department name migration...');
        console.log('📊 Current departments in database:');
        
        const currentDepts = await pool.query('SELECT * FROM departments ORDER BY department_id');
        currentDepts.rows.forEach(dept => {
            console.log(`  - ${dept.department_name} (${dept.code})`);
        });
        
        console.log('\n🔧 Updating department name from "ช่างเครื่องกลโรงงาน" to "ช่างกลโรงงาน"...');
        
        const result = await pool.query(`
            UPDATE departments 
            SET department_name = 'ช่างกลโรงงาน'
            WHERE department_name = 'ช่างเครื่องกลโรงงาน'
            RETURNING department_id, department_name, code
        `);
        
        if (result.rows.length > 0) {
            console.log('✅ Successfully updated department:');
            console.log(`   ID: ${result.rows[0].department_id}`);
            console.log(`   New Name: ${result.rows[0].department_name}`);
            console.log(`   Code: ${result.rows[0].code}`);
        } else {
            console.log('ℹ️  No department with old name found - department may already be updated');
        }
        
        console.log('\n📊 Updated departments list:');
        const updatedDepts = await pool.query('SELECT * FROM departments ORDER BY department_id');
        updatedDepts.rows.forEach(dept => {
            console.log(`  - ${dept.department_name} (${dept.code})`);
        });
        
        await pool.end();
        console.log('\n✅ Migration complete!');
    } catch (err) {
        console.error('❌ Error during migration:', err);
        await pool.end();
        process.exit(1);
    }
}

migrateDepartmentName();
