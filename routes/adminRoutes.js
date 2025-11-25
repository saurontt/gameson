// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Aplica os middlewares em todas as rotas de admin
router.use(authMiddleware);
router.use(adminMiddleware);

// Rota para buscar todas as configurações do sistema
router.get('/config', adminController.getConfiguracoes);

// Rota para atualizar uma configuração específica (ex: a taxa)
router.put('/config/:chave', adminController.atualizarConfiguracao);

module.exports = router;