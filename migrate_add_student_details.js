const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database', 'student_info.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database: ' + err.message);
    } else {
        console.log('Connected to the SQLite database.');
        addColumns();
    }
});

function addColumns() {
    db.serialize(() => {
        const columns = [
            "ALTER TABLE students ADD COLUMN blood_group TEXT",
            "ALTER TABLE students ADD COLUMN student_image TEXT",
            "ALTER TABLE students ADD COLUMN father_name TEXT",
            "ALTER TABLE students ADD COLUMN mother_name TEXT",
            "ALTER TABLE students ADD COLUMN parent_phone TEXT"
        ];

        columns.forEach(sql => {
            db.run(sql, (err) => {
                if (err) {
                    // Ignore error if column likely exists (duplicate column error)
                    if (err.message.includes("duplicate column name")) {
                        console.log(`Column already exists (skipped): ${sql}`);
                    } else {
                        console.error(`Error executing ${sql}: ${err.message}`);
                    }
                } else {
                    console.log(`Success: ${sql}`);
                }
            });
        });
    });
}
