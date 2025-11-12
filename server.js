// server.js - O arquivo principal que inicia o servidor
const express = require('express');
const cors = require('cors');
const db = require('./db');
const disputasRoutes = require('./routes/disputas');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('API da Plataforma de Disputas está no ar!'));
app.use('/api/disputas', disputasRoutes);

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});