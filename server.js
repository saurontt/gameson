// server.js

const express = require('express');
const path = require('path');

// Importa as rotas
const feedRoutes = require('./routes/feed');
const disputasRoutes = require('./routes/disputas');
const campeonatosRoutes = require('./routes/campeonatos');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.json());

app.use('/api/feed', feedRoutes);
app.use('/api/disputas', disputasRoutes);
app.use('/api/campeonatos', campeonatosRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.status(200).send('API da GamesOn está no ar!');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});