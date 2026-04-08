// Importação do banco de dados

import express, { json } from 'express';
import { config } from 'dotenv';
import cors from 'cors';
import db from './config/db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { error } from 'console';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

// Serve os arquivos da pasta 'public' (seu HTML vai aqui dentro!)

const staticPath = path.join(__dirname, '../../frontend/src');

app.use(express.static(staticPath));

// ---------------------  G E T  => LISTAR  ---------------------

app.get('/', (req, res) => {
    res.redirect('pages/auth/index.html');
})

app.get('/clientes', async (req, res) => {
    try {
        const puxarDados = "SELECT * FROM clientes";
        const [dados] = await db.query(puxarDados);
        res.status(200).json(dados);
    } catch (error) {
        console.log(`Erro ao puxar dados: ${error}`);
        res.status(500).send("Erro interno no servidor")
    }
});

app.post('/clientes', (req, res) => {
    const { tipo, titulo, cliente, numero, status, drescricao } = req.body;

});

app.post('/auth', async (req, res) => {
    const user = req.body.user;
    const password = req.body.password;

    try {
        const verificarDB = "SELECT user, password FROM login WHERE user = ? AND password = ?"; // Isso quer dizer que o PRIMEIRO que encontrar com esse USER pare a busca. SEMPRE SERÁ RETORNADO UM ARRAY [].
        const [rows] = await db.query(verificarDB, [user, password]);

        if (rows.length === 0) {
            return res.status(401).json({ mensagem: 'Usuário ou senha inválidos. ' });
        }

        const usuario = rows[0];

        return res.status(200).json({
            mensagem: 'Login efetuado com sucesso',
            redirectUrl: '/pages/main/index.html',
            usuario: {
                id: usuario.id,
                nome: usuario.user
            }
        });

    } catch (e) {
        console.error(error);
        return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
    }
})


const port = process.env.PORT_SERVER;
const host = process.env.HOST_SERVER;

app.listen(port, host, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
/* 
    Criar nossa API de Usuários

    -Criar um usuário
    -Listar todos os usuarios
    -Editar um usuario
    -Deletar um usuario

*/