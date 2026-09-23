import { db } from '../config/db.js';

const clienteModel = { // objeto com propriedade de type: function
    list: async () => {
        const query = "SELECT * FROM clientes";
        const [dados] = await db.query(query);
        return dados; // apenas devolve os dados brutos
    },
    verificarExistencia: async (numeroProc, numeroPasta) => {
        const query = "SELECT numeroProc, numeroPasta FROM clientes WHERE (numeroProc = ? AND numeroProc IS NOT NULL AND numeroProc != '') OR numeroPasta = ? LIMIT 1";

        const [registro] = await db.query(query, [numeroProc, Number(numeroPasta)]);
        return registro[0] || null;

    },
    create: async (dados) => {
        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = dados;

        const query = "INSERT INTO clientes (acao, nome, numeroPasta, tipo, numeroProc, status, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)";

        const [resultado] = await db.query(query, [acao, nome, Number(numeroPasta), tipo, numeroProc, status, descricao]);

        return resultado;
    }
}

export { clienteModel };