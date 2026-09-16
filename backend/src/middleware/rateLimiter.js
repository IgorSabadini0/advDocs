import rateLimit from 'express-rate-limit';

// Segurança: Rate Limiting para evitar ataques de Força Bruta (Brute Force) e DoS
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limita cada IP a 100 requisições por windowMs
    message: { mensagem: "Muitas requisições criadas a partir deste IP, por favor tente novamente após 15 minutos" }
});

// Segurança: Rate Limiting para rotas de autenticação (login)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Limita tentativas de login a 5 por 15 minutos
    message: { mensagem: "Muitas tentativas de login. Tente novamente mais tarde." }
});

export { apiLimiter, authLimiter };