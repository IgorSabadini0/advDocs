import rateLimit from 'express-rate-limit';

// Segurança: Rate Limiting para rotas autenticadas da API (clientes, tipos, usuários)
// Dimensionado para permitir uso simultâneo por múltiplos computadores no escritório (NAT/Wi-Fi compartilhado)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1500, // Limita requisições por IP a 1500 a cada 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { mensagem: "Muitas requisições criadas a partir deste IP, por favor tente novamente após 15 minutos." }
});

// Segurança: Rate Limiting estrito para rotas de autenticação (login) para evitar força bruta
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // Limita tentativas falhas de login a 10 por 15 minutos
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { mensagem: "Muitas tentativas de login incorretas a partir deste IP. Tente novamente mais tarde." }
});

export { apiLimiter, authLimiter };
