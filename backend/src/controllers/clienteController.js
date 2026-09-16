import db from '../config/db.js';
import { validateCliente } from '../validator/clientValidator.js'; // Importa a função de validação de cliente

export const listClientes = async (req, res) => {
    try {
        const queryBuscarClientes = "SELECT * FROM clientes";
        const [dados] = await db.query(queryBuscarClientes);
        res.status(200).json(dados);
    } catch (error) {
        console.error(`Erro ao puxar dados: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

export const createCliente = async (req, res) => {
    try {
        const validacao = validateCliente(req.body);
        if (!validacao.valido) {
            return res.status(400).json({ mensagem: validacao.mensagem });
        }

        const { acao, nome, numeroPasta, tipo, numeroProc, status, consultarProcesso, descricao } = req.body;

        if (consultarProcesso && numeroProc) {
            buscarProcesso(numeroProc); // Chama a função para buscar o processo no DataJud
        }

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
}