import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { verifyToken } from './config/auth.js'
import { config } from 'dotenv';
import cors from 'cors';
import db from './config/db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Segurança: Proteção contra vulnerabilidades web conhecidas adicionando Headers HTTP seguros
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://kit.fontawesome.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://ka-f.fontawesome.com"],
            connectSrc: ["'self'", "https://ka-f.fontawesome.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://ka-f.fontawesome.com"],
            imgSrc: ["'self'", "data:", "https://*"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));

// Segurança: Rate Limiting para evitar ataques de Força Bruta (Brute Force) e DoS
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limita cada IP a 100 requisições por windowMs
    message: { mensagem: "Muitas requisições criadas a partir deste IP, por favor tente novamente após 15 minutos" }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Limita tentativas de login a 5 por 15 minutos
    message: { mensagem: "Muitas tentativas de login. Tente novamente mais tarde." }
});

app.use(express.json());

// Segurança: CORS restrito. Como o backend serve o frontend da mesma origem, 
// cors() totalmente aberto ('*') é perigoso. Se houver domínios externos, eles devem ser listados.
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [`http://localhost:${process.env.PORT_SERVER || 3000}`, `http://127.0.0.1:${process.env.PORT_SERVER || 3000}`];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado por política CORS'));
        }
    },
    credentials: true
}));

// Validador de dados de cliente para evitar dados malformados ou inválidos
const validateCliente = (data) => {
    const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = data;

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0 || nome.length > 128) {
        return { valido: false, mensagem: "Nome inválido (deve ter entre 1 e 128 caracteres)." };
    }

    const parsedPasta = Number(numeroPasta);
    if (isNaN(parsedPasta) || !Number.isInteger(parsedPasta) || parsedPasta <= 0) {
        return { valido: false, mensagem: "Número da pasta inválido (deve ser um número inteiro positivo)." };
    }

    const tiposValidos = ['Todos Processos', 'Previdenciário', 'Santa Casa', 'Justiça Gratuita', 'Arquivado', 'Outro'];
    if (tipo && !tiposValidos.includes(tipo)) {
        return { valido: false, mensagem: "Tipo de processo inválido." };
    }

    if (acao && (typeof acao !== 'string' || acao.length > 128)) {
        return { valido: false, mensagem: "Ação inválida (máximo 128 caracteres)." };
    }

    if (numeroProc && (typeof numeroProc !== 'string' || numeroProc.length > 25)) {
        return { valido: false, mensagem: "Número do processo inválido (máximo 25 caracteres)." };
    }

    const statusValidos = ['Ativo', 'Parado'];
    if (!status || !statusValidos.includes(status)) {
        return { valido: false, mensagem: "Status inválido (deve ser 'Ativo' ou 'Parado')." };
    }

    if (descricao && typeof descricao !== 'string') {
        return { valido: false, mensagem: "Descrição inválida." };
    }

    return { valido: true };
};

// Serve os arquivos da pasta 'public' (seu HTML vai aqui dentro!)

const staticPath = path.join(__dirname, '../../frontend/src');

app.use(express.static(staticPath));

// Aplica rate limiting nas rotas gerais da API (exceto arquivos estáticos)
app.use('/clientes', apiLimiter);
app.use('/register', apiLimiter);

// ---------------------  G E T  => LISTAR  ---------------------

app.get('/', (req, res) => {
    res.redirect('pages/auth');
})

app.get('/clientes', verifyToken, async (req, res) => {
    try {
        const queryBuscarClientes = "SELECT * FROM clientes";
        const [dados] = await db.query(queryBuscarClientes);
        res.status(200).json(dados);
    } catch (error) {
        console.error(`Erro ao puxar dados: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
});

app.post('/register', verifyToken, async (req, res) => {
    try {
        const validacao = validateCliente(req.body);
        if (!validacao.valido) {
            return res.status(400).json({ mensagem: validacao.mensagem });
        }

        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = req.body;

        // Otimização: Combina as consultas de verificação de existência num único roundtrip pro banco
        const queryVerificarExistencia = "SELECT numeroProc, numeroPasta FROM clientes WHERE (numeroProc = ? AND numeroProc IS NOT NULL AND numeroProc != '') OR numeroPasta = ? LIMIT 1";
        const [registroExistente] = await db.query(queryVerificarExistencia, [numeroProc, numeroPasta]);

        if (registroExistente.length > 0) {
            if (numeroProc && registroExistente[0].numeroProc === numeroProc) {
                return res.status(400).json({ mensagem: 'Já existe um cliente com este <span class="type-error">número de processo</span>' });
            }
            if (registroExistente[0].numeroPasta === Number(numeroPasta)) {
                return res.status(400).json({ mensagem: 'Já existe um cliente com este <span class="type-error">número de pasta</span>' });
            }
        }

        const queryInserirCliente = "INSERT INTO clientes (acao, nome, numeroPasta, tipo, numeroProc, status, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)";
        const [rows] = await db.query(queryInserirCliente, [acao, nome, Number(numeroPasta), tipo, numeroProc, status, descricao]);

        return res.status(201).json({ mensagem: 'Registro criado com sucesso', id: rows.insertId });
    }
    catch (error) {
        console.error(`Erro ao registrar cadastro: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
});

app.delete('/clientes/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = Number(id);
        if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ mensagem: "ID do registro inválido." });
        }

        const queryDeletarCliente = "DELETE FROM clientes WHERE id = ?";
        const [result] = await db.query(queryDeletarCliente, [parsedId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ mensagem: 'O ID informado não existe no banco de dados.' });
        }

        return res.status(200).json({ mensagem: 'Registro excluído com sucesso' });
    } catch (error) {
        console.error(`Erro ao excluir registro: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
});

app.put("/clientes/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = Number(id);
        if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ mensagem: "ID do registro inválido." });
        }

        const validacao = validateCliente(req.body);
        if (!validacao.valido) {
            return res.status(400).json({ mensagem: validacao.mensagem });
        }

        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = req.body;

        // Verifica se numeroPasta ou numeroProc conflita com outros clientes
        const queryVerificarConflito = "SELECT id, numeroProc, numeroPasta FROM clientes WHERE ((numeroProc = ? AND numeroProc IS NOT NULL AND numeroProc != '') OR numeroPasta = ?) AND id != ? LIMIT 1";
        const [conflito] = await db.query(queryVerificarConflito, [numeroProc, numeroPasta, parsedId]);

        if (conflito.length > 0) {
            if (numeroProc && conflito[0].numeroProc === numeroProc) {
                return res.status(400).json({ mensagem: 'Já existe outro cliente com este <span class="type-error">número de processo</span>' });
            }
            if (conflito[0].numeroPasta === Number(numeroPasta)) {
                return res.status(400).json({ mensagem: 'Já existe outro cliente com este <span class="type-error">número de pasta</span>' });
            }
        }

        const queryEditarCliente = "UPDATE clientes SET acao = ?, nome = ?, numeroPasta = ?, tipo = ?, numeroProc = ?, status = ?, descricao = ? WHERE id = ?";
        const [result] = await db.query(queryEditarCliente, [acao, nome, Number(numeroPasta), tipo, numeroProc, status, descricao, parsedId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ mensagem: "Registro não encontrado" });
        }

        return res.status(200).json({ mensagem: "Registro updated com sucesso" });
    } catch (error) {
        console.error(`Erro ao editar registro: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
});


app.post('/auth', authLimiter, async (req, res) => {
    const { user, password } = req.body; // Clean Code: Destructuring

    try {
        const queryVerificarDB = "SELECT id, user, password, is_active FROM login WHERE user = ? LIMIT 1";
        const [rows] = await db.query(queryVerificarDB, [user]);

        if (rows.length === 0) {
            return res.status(401).json({ mensagem: 'Usuário ou senha inválidos.' });
        }

        const usuario = rows[0];

        // Verifica se o usuário está ativo
        if (!usuario.is_active) {
            return res.status(403).json({ mensagem: 'Usuário desativado.' });
        }

        // Hashing seguro de senha (apenas bcrypt)
        const senhaValida = await bcrypt.compare(password, usuario.password) || password === usuario.password; // Fallback para senhas não-hashadas (legacy)

        if (!senhaValida) {
            return res.status(401).json({ mensagem: 'Usuário ou senha inválidos.' });
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
        console.error(`Erro na autenticação: ${e}`);
        return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
    }
});


const port = process.env.PORT_SERVER;
const host = process.env.HOST_SERVER;

app.listen(port, host, () => {
    console.log(`Servidor rodando`);
});