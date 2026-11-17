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
 * Garante a coluna `icone` em `tipos_processo` de forma idempotente em qualquer versão do schema.
 */
const garantirColunaIconeTiposProcesso = async (connPool) => {
    const [cols] = await connPool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tipos_processo'
          AND COLUMN_NAME = 'icone'
        LIMIT 1
    `);

    if (cols.length === 0) {
        await connPool.query(`
            ALTER TABLE tipos_processo
            ADD COLUMN icone VARCHAR(100) NOT NULL DEFAULT 'fa-solid fa-folder'
        `);
    }
};

/**
 * Executa todas as migrations SQL ordenadas em `backend/src/database/migrations`.
 */
export const runMigrations = async (connPool = db) => {
    await garantirColunaIconeTiposProcesso(connPool);

    const arquivos = (await fs.readdir(MIGRATIONS_DIR))
        .filter(f => f.endsWith('.sql'))
        .sort();

    const executadas = [];

    for (const arquivo of arquivos) {
        const fullPath = path.join(MIGRATIONS_DIR, arquivo);
        const sql = await fs.readFile(fullPath, 'utf8');
        const statements = extrairStatementsSQL(sql);

        for (const stmt of statements) {
            try {
                await connPool.query(stmt);
            } catch (err) {
                // Ignora coluna duplicada em execuções repetidas de migrations legadas
                if (err?.code === 'ER_DUP_FIELDNAME' || err?.errno === 1060) {
                    continue;
                }
                throw err;
            }
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
