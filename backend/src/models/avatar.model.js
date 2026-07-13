const db = require('../config/database');

async function findByUserId(userId) {
  const result = await db.query('SELECT * FROM user_avatars WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

// Un utilisateur n'a qu'un seul avatar : remplace l'existant (contrainte UNIQUE sur user_id)
async function upsert({ userId, fileName, filePath, fileSize, fileType }) {
  const result = await db.query(
    `INSERT INTO user_avatars (user_id, file_name, file_path, file_size, file_type, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE
       SET file_name = EXCLUDED.file_name,
           file_path = EXCLUDED.file_path,
           file_size = EXCLUDED.file_size,
           file_type = EXCLUDED.file_type,
           uploaded_at = now()
     RETURNING *`,
    [userId, fileName, filePath, fileSize, fileType]
  );
  return result.rows[0];
}

module.exports = { findByUserId, upsert };
