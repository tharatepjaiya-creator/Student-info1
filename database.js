const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Use DATABASE_URL from environment (Vercel provides this)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('CRITICAL: DATABASE_URL is missing. Please check Vercel Environment Variables.');
}

const pool = new Pool({
    connectionString: connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

// Helper for running queries
const query = (text, params) => pool.query(text, params);

// Initialize Database Tables
const initDb = async () => {
    try {
        console.log('Checking database connection & schema...');
        
        // Departments Table
        await query(`CREATE TABLE IF NOT EXISTS departments (
            department_id SERIAL PRIMARY KEY,
            department_name TEXT NOT NULL,
            code TEXT NOT NULL
        )`);

        // Admin Users Table
        await query(`CREATE TABLE IF NOT EXISTS admin_users (
            admin_id SERIAL PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'admin'
        )`);

        // Students Table
        await query(`CREATE TABLE IF NOT EXISTS students (
            student_id SERIAL PRIMARY KEY,
            prefix TEXT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            dob TEXT NOT NULL, 
            phone TEXT,
            department_id INTEGER,
            student_code TEXT UNIQUE,
            password TEXT, 
            level TEXT, 
            blood_group TEXT,
            student_image TEXT,
            father_name TEXT,
            mother_name TEXT,
            parent_phone TEXT,
            FOREIGN KEY (department_id) REFERENCES departments (department_id)
        )`);

        // Announcements Table
        await query(`CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            image TEXT, 
            department_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (department_id) REFERENCES departments (department_id)
        )`);

        // Session Table for connect-pg-simple
        await query(`CREATE TABLE IF NOT EXISTS "session" (
            "sid" varchar NOT NULL COLLATE "default",
            "sess" json NOT NULL,
            "expire" timestamp(6) NOT NULL
        ) WITH (OIDS=FALSE)`);

        await query(`ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE`);
        await query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);

        console.log('Database schema verified.');
        await seedData();
        
    } catch (err) {
        // Ignore session table exists error
        if (err.message && !err.message.includes('already exists')) {
            console.error('Error initializing database:', err);
        }
    }
};

const seedData = async () => {
    try {
        // Seed Departments
        const deptRes = await query("SELECT count(*) as count FROM departments");
        if (parseInt(deptRes.rows[0].count) === 0) {
            console.log("Seeding Departments...");
            const depts = [
                ["เทคโนโลยีคอมพิวเตอร์", "COM"],
                ["อิเล็กทรอนิกส์", "ELEC"],
                ["ช่างไฟฟ้ากำลัง", "POWER"],
                ["เทคโนโลยีสารสนเทศ", "IT"],
                ["ช่างโยธา", "CIVIL"],
                ["ช่างก่อสร้าง", "CONST"],
                ["ช่างเชื่อม", "WELD"],
                ["ช่างเมคคาทรอนิกส์", "MECHA"],
                ["ช่างยนต์", "AUTO"]
            ];
            
            for (const [name, code] of depts) {
                await query("INSERT INTO departments (department_name, code) VALUES ($1, $2)", [name, code]);
            }
        }

        // Seed Admin
        const adminRes = await query("SELECT count(*) as count FROM admin_users");
        if (parseInt(adminRes.rows[0].count) === 0) {
            console.log("Seeding Admin...");
            const password = 'admin'; 
            const saltRounds = 10;
            const hash = await bcrypt.hash(password, saltRounds);
            await query("INSERT INTO admin_users (username, password, email) VALUES ($1, $2, $3)", 
                ['admin', hash, 'admin@example.com']);
        }
    } catch (err) {
        console.error('Error seeding data:', err);
    }
};

// Run init on start
module.exports = {
    query,
    pool,
    initDb
};
