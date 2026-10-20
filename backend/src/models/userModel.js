import { db } from '../config/db.js';

export const userModel = {
    findByUsername: async (user) => {
        const query = "SELECT id, user, name, password, is_active FROM login WHERE LOWER(user) = LOWER(?) LIMIT 1";
        const [rows] = await db.query(query, [user]);
        return rows[0] || null;
    },

    findById: async (id) => {
        const query = "SELECT id, user, name, password, is_active, created_at, updated_at FROM login WHERE id = ? LIMIT 1";
        const [rows] = await db.query(query, [id]);
        return rows[0] || null;
    },

    listUsers: async () => {
        const query = "SELECT id, user, name, is_active, created_at, updated_at FROM login ORDER BY name ASC";
        const [rows] = await db.query(query);
        return rows;
    },

    updatePassword: async (id, hashedPassword) => {
        const query = "UPDATE login SET password = ? WHERE id = ?";
        const [result] = await db.query(query, [hashedPassword, id]);
        return result;
    },

    updateName: async (id, name) => {
        const query = "UPDATE login SET name = ? WHERE id = ?";
        const [result] = await db.query(query, [name.trim(), id]);
        return result;
    },

    create: async ({ user, name, password, is_active = true }) => {
        const query = "INSERT INTO login (user, name, password, is_active) VALUES (?, ?, ?, ?)";
        const [result] = await db.query(query, [user.trim().toLowerCase(), name.trim(), password, is_active ? 1 : 0]);
        return result;
    },

    toggleActive: async (id, is_active) => {
        const query = "UPDATE login SET is_active = ? WHERE id = ?";
        const [result] = await db.query(query, [is_active ? 1 : 0, id]);
        return result;
    },

    delete: async (id) => {
        const query = "DELETE FROM login WHERE id = ?";
        const [result] = await db.query(query, [id]);
        return result;
    }
};

export default userModel;
