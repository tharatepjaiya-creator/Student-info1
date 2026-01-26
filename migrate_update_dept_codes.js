/**
 * Migration Script: Update Department Codes
 * 
 * Updates department code abbreviations:
 * - เทคโนโลยีสารสนเทศ = IT
 * - ช่างกลโรงงาน = M
 * - ช่างก่อสร้าง = B
 * - ช่างอิเล็กทรอนิกส์ = EL
 * - ช่างยนต์ = A
 * - ช่างไฟฟ้ากำลัง = E
 * - ช่างโยธา = CV
 * - ช่างเชื่อม = W
 * - เทคโนโลยีคอมพิวเตอร์ = TC
 * - ช่างเมคคาทรอนิกส์ = MN
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const departmentCodes = [
    { name: 'เทคโนโลยีสารสนเทศ', code: 'IT' },
    { name: 'ช่างกลโรงงาน', code: 'M' },
    { name: 'ช่างก่อสร้าง', code: 'B' },
    { name: 'อิเล็กทรอนิกส์', code: 'EL' },
    { name: 'ช่างอิเล็กทรอนิกส์', code: 'EL' },
    { name: 'ช่างยนต์', code: 'A' },
    { name: 'ช่างไฟฟ้ากำลัง', code: 'E' },
    { name: 'ช่างโยธา', code: 'CV' },
    { name: 'ช่างเชื่อม', code: 'W' },
    { name: 'เทคโนโลยีคอมพิวเตอร์', code: 'TC' },
    { name: 'ช่างเมคคาทรอนิกส์', code: 'MN' }
];

async function migrate() {
    console.log('🚀 Starting migration: Updating Department Codes...');
    
    try {
        for (const dept of departmentCodes) {
            const result = await pool.query(
                `UPDATE departments SET code = $1 WHERE department_name LIKE $2`,
                [dept.code, `%${dept.name}%`]
            );
            
            if (result.rowCount > 0) {
                console.log(`✅ Updated: ${dept.name} → ${dept.code}`);
            }
        }
        
        // Also update student_groups table to reflect new codes
        console.log('\n📋 Updating student_groups names with new codes...');
        
        const groups = await pool.query(`
            SELECT g.group_id, g.group_name, g.level, d.code as dept_code
            FROM student_groups g
            LEFT JOIN departments d ON g.department_id = d.department_id
        `);
        
        for (const group of groups.rows) {
            if (group.dept_code && group.level) {
                const levelNum = group.level.replace('ปวช.', '').replace('ปวส.', '');
                const newGroupName = `${group.dept_code}.${levelNum}`;
                
                await pool.query(
                    `UPDATE student_groups SET group_name = $1 WHERE group_id = $2`,
                    [newGroupName, group.group_id]
                );
                console.log(`  Updated group: ${group.group_name} → ${newGroupName}`);
            }
        }
        
        console.log('\n🎉 Migration completed successfully!');
        
        // Show current departments
        const depts = await pool.query(`SELECT department_name, code FROM departments ORDER BY department_name`);
        console.log('\n📊 Current Department Codes:');
        depts.rows.forEach(d => console.log(`   ${d.department_name}: ${d.code}`));
        
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
