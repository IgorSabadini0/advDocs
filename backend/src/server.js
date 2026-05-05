import express, { json } from 'express';
import jwt from 'jsonwebtoken';
import { verifyToken } from './config/auth.js'
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
    res.redirect('pages/auth');
})

app.get('/clientes', async (req, res) => {
    try {
        const puxarDados = "SELECT * FROM clientes";
        const [dados] = await db.query(puxarDados);
        res.status(200).json(dados);
    } catch (error) {
        console.log(`Erro ao puxar dados: ${error}`);
        return res.status(500).send("Erro interno no servidor");
    }
});

app.post('/register', verifyToken, async (req, res) => {
    try {
        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = req.body;
        const inserirDados = "INSERT INTO clientes (acao, nome, numeroPasta, tipo, numeroProc, status, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)";
        const [rows] = await db.query(inserirDados, [acao, nome, numeroPasta, tipo, numeroProc, status, descricao]);

        return res.status(201).json({ mensagem: 'Registro criado com sucesso', id: rows.insertId });
    }
    catch (error) {
        console.log(`Erro ao registrar cadastro: ${error}`);
        return res.status(500).send("Erro interno no servidor");
    }

});

app.delete('/clientes/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const deletarDados = "DELETE FROM clientes WHERE id = ?";
        const [result] = await db.query(deletarDados, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ mensagem: 'O ID informado não existe no banco de dados.' });
        }

        return res.status(200).json({ mensagem: 'Registro excluído com sucesso' });
    } catch (error) {
        console.error(`Erro ao excluir registro: ${error}`);
        return res.status(500).send("Erro interno no servidor");
    }
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

        //Lógica para gerar de Token de autenticação
        const token = jwt.sign(
            { id: usuario.id, nome: usuario.user },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        return res.status(200).json({
            mensagem: 'Login efetuado com sucesso',
            redirectUrl: '/pages/main',
            token: token, // ENVIA O TOKEN LÁ PARA O FRONT-END
            usuario: {
                id: usuario.id,
                nome: usuario.user
            }
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
    }
})


const port = process.env.PORT_SERVER;
const host = process.env.HOST_SERVER;

app.listen(port, host, () => {
    console.log(`Servidor rodando`);
});