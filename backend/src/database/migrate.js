import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const extrairStatementsSQL = (sqlContent) => {
    const semComentariosLinha = sqlContent
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');

    return semComentariosLinha
        .split(/;\s*(?:\r?\n|$)/)
        .map(stmt => stmt.trim())
        .filter(Boolean);
};

/**
 * Executa todas as migrations SQL ordenadas em `backend/src/database/migrations`.
 */
export const runMigrations = async (connPool = db) => {
    const arquivos = (await fs.readdir(MIGRATIONS_DIR))
        .filter(f => f.endsWith('.sql'))
        .sort();

    const executadas = [];

    for (const arquivo of arquivos) {
        const fullPath = path.join(MIGRATIONS_DIR, arquivo);
        const sql = await fs.readFile(fullPath, 'utf8');
        const statements = extrairStatementsSQL(sql);

        for (const stmt of statements) {
            await connPool.query(stmt);
        }

        executadas.push({ arquivo, statements: statements.length });
    }

    return executadas;
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    runMigrations()
        .then(async (resultado) => {
            console.log('Migrations aplicadas com sucesso:', resultado);
            await db.end();
        })
        .catch(async (error) => {
            console.error('Erro ao aplicar migrations:', error);
            await db.end();
            process.exit(1);
        });
}
