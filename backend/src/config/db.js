// banco de dados MySQL
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega as variáveis de ambiente a partir da raiz do projeto
config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    port: Number(process.env.DB_PORT || process.env.PORT || 3306),
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testarConexao() { // função para teste de conexão com o DB acima.
    try {
        const connection = await db.getConnection();
        console.log("Conectado ao MySQL com sucesso!");
        connection.release();
    } catch (error) {
        console.error("Erro ao conectar no banco:", error.message);
    }
}

testarConexao();

export { db };
