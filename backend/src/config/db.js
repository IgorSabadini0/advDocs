// banco de dados MySQL
import { config } from 'dotenv';

import mysql from 'mysql2/promise'

config({ quiet: true }); // Carrega as variáveis de ambiente do arquivo .env

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    port: process.env.PORT,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

export default db;

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