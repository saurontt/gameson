// src/controllers/adminController.js
const db = require('../db');

const adminController = {
    // Buscar todas as configurações
    getConfiguracoes: async (req, res) => {
        try {
            const result = await db.query('SELECT * FROM configuracoes_sistema ORDER BY chave');
            res.status(200).json(result.rows);
        } catch (error) {
            console.error('Erro ao buscar configurações:', error);
            res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    },

    // Atualizar uma configuração
    atualizarConfiguracao: async (req, res) => {
        const { chave } = req.params;
        const { valor } = req.body;

        if (!chave || !valor) {
            return res.status(400).json({ error: 'Chave e valor são obrigatórios.' });
        }

        try {
            const result = await db.query(
                'UPDATE configuracoes_sistema SET valor = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE chave = $2 RETURNING *',
                [valor, chave]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Configuração não encontrada.' });
            }

            res.status(200).json({ message: 'Configuração atualizada com sucesso!', config: result.rows[0] });

        } catch (error) {
            console.error('Erro ao atualizar configuração:', error);
            res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    }
};

module.exports = adminController;