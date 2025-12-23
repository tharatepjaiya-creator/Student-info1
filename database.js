const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database', 'student_info.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database ' + dbPath + ': ' + err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Departments Table
        db.run(`CREATE TABLE IF NOT EXISTS departments (
            department_id INTEGER PRIMARY KEY AUTOINCREMENT,
            department_name TEXT NOT NULL,
            code TEXT NOT NULL
        )`);

        // Admin Users Table
        db.run(`CREATE TABLE IF NOT EXISTS admin_users (
            admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'admin'
        )`);

        // Students Table
        db.run(`CREATE TABLE IF NOT EXISTS students (
            student_id INTEGER PRIMARY KEY AUTOINCREMENT,
            prefix TEXT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            dob TEXT NOT NULL, -- Format: YYYY-MM-DD
            phone TEXT,
            department_id INTEGER,
            student_code TEXT UNIQUE, -- Custom Student ID (e.g. 68319090016)
            password TEXT, -- Hashed DOB
            level TEXT, -- e.g. ปวช.1
            FOREIGN KEY (department_id) REFERENCES departments (department_id)
        )`);

        // Announcements Table
        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            image TEXT, -- Path to image
            department_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (department_id) REFERENCES departments (department_id)
        )`);

        // Seed Data
        seedData();
    });
}

function seedData() {
    // Seed Departments
    db.get("SELECT count(*) as count FROM departments", (err, row) => {
        if (err) { return console.error(err.message); }
        if (row.count === 0) {
            console.log("Seeding Departments...");
            const stmt = db.prepare("INSERT INTO departments (department_name, code) VALUES (?, ?)");
            stmt.run("เทคโนโลยีคอมพิวเตอร์", "COM");
            stmt.run("อิเล็กทรอนิกส์", "ELEC");
            stmt.run("ช่างไฟฟ้ากำลัง", "POWER");
            stmt.run("เทคโนโลยีสารสนเทศ", "IT");
            stmt.run("ช่างโยธา", "CIVIL");
            stmt.run("ช่างก่อสร้าง", "CONST");
            stmt.run("ช่างเชื่อม", "WELD");
            stmt.run("ช่างเมคคาทรอนิกส์", "MECHA");
            stmt.run("ช่างยนต์", "AUTO");
            stmt.finalize();
        }
    });

    // Seed Admin
    db.get("SELECT count(*) as count FROM admin_users", (err, row) => {
        if (err) { return console.error(err.message); }
        if (row.count === 0) {
            console.log("Seeding Admin...");
            const password = 'admin'; // Default password
            const saltRounds = 10;
            bcrypt.hash(password, saltRounds, (err, hash) => {
                if (err) { return console.error(err); }
                db.run("INSERT INTO admin_users (username, password, email) VALUES (?, ?, ?)", 
                    ['admin', hash, 'admin@example.com']);
            });
        }
    });
}

module.exports = db;
