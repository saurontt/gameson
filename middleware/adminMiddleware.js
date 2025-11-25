const db = require('../db');

const adminMiddleware = async (req, res, next) => {
    try {
        const usuarioId = req.usuarioId; 

        if (!usuarioId) {
            return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        const result = await db.query('SELECT "isAdmin" FROM usuarios WHERE id = $1', [usuarioId]);

        if (result.rows.length === 0 || !result.rows[0].isAdmin) {
            return res.status(403).json({ error: 'Acesso negado. Ação permitida apenas para administradores.' });
        }

        next();
    } catch (error) {
        console.error('Erro no middleware de admin:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

module.exports = adminMiddleware;