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
import processosRouter from './routes/processos.js';

// Importado apenas para alias de compatibilidade com o frontend
import { clienteController } from './controllers/clienteController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Garante o carregamento do .env a partir da raiz do projeto
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const app = express();

// 1. Segurança e Headers HTTP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://kit.fontawesome.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://ka-f.fontawesome.com"],
            connectSrc: ["'self'", "https://ka-f.fontawesome.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://ka-f.fontawesome.com"],
            imgSrc: ["'self'", "data:", "https://*"],
            objectSrc: ["'none'"]
        },
    },
}));

app.use(express.json());

// 2. Política CORS
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

// 3. Servir arquivos estáticos do frontend
const staticPath = path.join(__dirname, '../../frontend/src');
app.use(express.static(staticPath));

// 4. Redirecionamento da Raiz para a página de autenticação
app.get('/', (req, res) => {
    res.redirect('/pages/auth/');
});

// 5. Rotas da Aplicação (Padrão MVC)
app.use('/auth', authRouter);
app.use('/clientes', verifyToken, clientesRouter);
app.use('/processos', verifyToken, processosRouter);

// Compatibilidade retrógrada com frontend de cadastro
app.post('/register', verifyToken, (req, res) => {
    clienteController.createCliente(req, res);
});

// 6. Inicialização do Servidor
const port = process.env.PORT_SERVER || 3000;
const host = process.env.HOST_SERVER || '0.0.0.0';

app.listen(port, host, () => {
    console.log(process.env.MESSAGE_SERVER || ".ENV carregado");
    console.log(`Servidor rodando em http://localhost:${port}`);
});