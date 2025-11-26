// get-token.js

const https = require('https'); // O Node.js tem um módulo https nativo
const { execSync } = require('child_process');

const LOGIN_URL = 'https://gameson.onrender.com/api/usuarios/login';
const PAYLOAD = {
    "email": "teste@teste.com",
    "senha": "qualquercoisa123"
};

console.log('Fazendo login para obter o token...');

const req = https.request(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(PAYLOAD)
});

req.on('response', (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const parsedData = JSON.parse(data);
            const token = parsedData.token;
            
            // Salva o token em uma variável de ambiente para o Windows
            // O comando `setx` funciona em CMD e PowerShell
            execSync(`setx TOKEN_JET=${token}`, (error, stdout, stderr) => {
                if (error) {
                    console.error('Erro ao definir a variável de ambiente:', error.message);
                    return;
                }
                console.log(`\n✅ TOKEN_JET definida com sucesso!\n`);
                console.log(`Valor: ${token}`);
            });
            
        } catch (e) {
            console.error('Erro ao processar a resposta do servidor:', e.message);
        }
    });
});

req.on('error', (e) => {
    console.error(`Erro na requisição de login: ${e.message}`);
});