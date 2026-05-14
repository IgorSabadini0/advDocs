import express, { json } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
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

app.get('/clientes', verifyToken, async (req, res) => {
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
        // Pega cliente pelo numero do processo e verifica se já existe no banco de dados
        const { numeroProc } = req.body;
        const verificarProc = "SELECT numeroProc FROM clientes WHERE numeroProc = ?";
        const [procExistente] = await db.query(verificarProc, [numeroProc]);

        if (procExistente.length > 0) {
            return res.status(400).json({ mensagem: 'Já existe um cliente com este <span class="type-error">número de processo</span>' });
        }

        // Verifica se o número da pasta já existe no banco de dados
        const { numeroPasta } = req.body;
        const verificarPasta = "SELECT numeroPasta FROM clientes WHERE numeroPasta = ?";
        const [pastaExistente] = await db.query(verificarPasta, [numeroPasta]);

        if (pastaExistente.length > 0) {
            return res.status(400).json({ mensagem: 'Já existe um cliente com este <span class="type-error">número de pasta</span>' });
        }

        const { acao, nome, tipo, status, descricao } = req.body;
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
        const verificarDB = "SELECT id, user, password FROM login WHERE user = ? LIMIT 1";
        const [rows] = await db.query(verificarDB, [user]);

        if (rows.length === 0) {
            return res.status(401).json({ mensagem: 'Usuário ou senha inválidos. ' });
        }

        const usuario = rows[0];
        const senhaValida = await bcrypt.compare(password, usuario.password);

        if (!senhaValida) {
            return res.status(401).json({ mensagem: 'Usuário ou senha inválidos. ' });
        }

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