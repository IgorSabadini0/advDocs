// Queries de login

const authModel = {
    verificarUsuario: async (user) => {
        const queryVerificarDB = "SELECT id, user, password, is_active FROM login WHERE user = ? LIMIT 1";
        const [rows] = await db.query(queryVerificarDB, [user]);
        return rows[0] || null;
    }
};

export { authModel };