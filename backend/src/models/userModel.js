import { db } from '../config/db.js';

export const userModel = {
    findByUsername: async (user) => {
        const query = "SELECT id, user, name, password, is_active FROM login WHERE user = ? LIMIT 1";
        const [rows] = await db.query(query, [user]);
        return rows[0] || null;
    },

    findById: async (id) => {
        const query = "SELECT id, user, name, is_active FROM login WHERE id = ? LIMIT 1";
        const [rows] = await db.query(query, [id]);
        return rows[0] || null;
    }
};

export default userModel;
