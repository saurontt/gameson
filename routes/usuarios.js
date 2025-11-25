// routes/usuarios.js
const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');

// Rota para registrar um novo usuário
router.post('/', usuarioController.registrar);

// Rota para fazer login
router.post('/login', usuarioController.login);

module.exports = router;