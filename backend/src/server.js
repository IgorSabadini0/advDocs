import express from 'express';
import { config } from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';

// Middlewares
import { verifyToken } from './middleware/authMiddleware.js';

// Routers (Padrão MVC)
import clientesRouter from './routes/clientes.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Garante o carregamento do .env a partir da raiz do projeto
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: Variável de ambiente JWT_SECRET ausente ou insegura (mínimo 32 caracteres).');
    process.exit(1);
}

const app = express();

// Confia no primeiro proxy reverso (ex: Nginx, Docker, Cloudflare) para Rate Limiting correto por IP
app.set('trust proxy', 1);

// 1. Segurança e Headers HTTP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://ka-f.fontawesome.com"],
            connectSrc: ["'self'", "https://ka-f.fontawesome.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://ka-f.fontawesome.com"],
            imgSrc: ["'self'", "data:", "https://*"],
            objectSrc: ["'none'"]
        },
    },
}));

app.use(express.json({ limit: '16kb' }));

// 2. Política CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
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

// 3. Servir arquivos estáticos do frontend
const staticPath = path.join(__dirname, '../../frontend/src');
app.use(express.static(staticPath));

// 4. Rota Raiz: entrega o gateway que valida se o usuário já possui sessão ativa no navegador
app.get('/', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});

// 5. Rotas da Aplicação (Padrão MVC)
app.use('/auth', authRouter);
app.use('/clientes', verifyToken, clientesRouter);
app.use('/users', verifyToken, usersRouter);

// 6. Middleware Centralizado de Tratamento de Erros
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ mensagem: 'Payload JSON malformado.' });
    }

    if (err.message === 'Bloqueado por política CORS') {
        return res.status(403).json({ mensagem: err.message });
    }

    console.error(`[Erro Não Tratado] ${req.method} ${req.originalUrl}:`, err);
    const status = err.statusCode || 500;
    return res.status(status).json({
        mensagem: status === 500 ? 'Erro interno no servidor.' : err.message
    });
});

// 7. Inicialização do Servidor
const port = process.env.PORT_SERVER || 3000;
const host = process.env.HOST_SERVER || '0.0.0.0';

app.listen(port, host, () => {
    console.log(process.env.MESSAGE_SERVER || ".ENV carregado");
    console.log(`Servidor rodando em http://localhost:${port}`);
});
