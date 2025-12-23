const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database', 'student_info.db');

const db = new sqlite3.Database(dbPath);

console.log("Adding 'level' column to students table...");

db.run("ALTER TABLE students ADD COLUMN level TEXT", (err) => {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log("Column 'level' already exists.");
        } else {
            console.error("Error adding column:", err.message);
        }
    } else {
        console.log("Column 'level' added successfully.");
    }
    db.close();
});
