import { clienteModel } from '../models/clienteModel.js';
import { userModel } from '../models/userModel.js';
import { validateCliente } from '../validator/clientValidator.js';
import { buscarProcesso } from '../services/datajudServices.js';

const listClientes = async (req, res) => {
    try {
        const clientes = await clienteModel.list();
        return res.status(200).json(clientes);
    } catch (error) {
        console.error(`Erro ao puxar dados: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const createCliente = async (req, res) => {
    try {
        const validacao = validateCliente(req.body);
        if (!validacao.valido) {
            return res.status(400).json({ mensagem: validacao.mensagem });
        }

        const { acao, nome, numeroPasta, tipo, numeroProc, status, consultarProcesso, descricao } = req.body;

        if (consultarProcesso && numeroProc) {
            await buscarProcesso(numeroProc);
        }

        const registroExistente = await clienteModel.verificarExistencia(numeroProc, numeroPasta);
        if (registroExistente) {
            if (numeroProc && registroExistente.numeroProc === numeroProc) {
                return res.status(400).json({ mensagem: 'Já existe outro cliente com este <span class="type-error">número de processo</span>' });
            }
            if (registroExistente.numeroPasta === Number(numeroPasta)) {
                return res.status(400).json({ mensagem: 'Já existe outro cliente com este <span class="type-error">número de pasta</span>' });
            }
        }

        const resultado = await clienteModel.create({
            acao,
            nome,
            numeroPasta,
            tipo,
            numeroProc,
            status,
            descricao
        });

        return res.status(201).json({ mensagem: "Cliente cadastrado com sucesso!", id: resultado.insertId });
    } catch (error) {
        console.error(`Erro ao registrar cadastro: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const updateCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = Number(id);

        if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ mensagem: "ID do registro inválido." });
        }

        const validacao = validateCliente(req.body);
        if (!validacao.valido) {
            return res.status(400).json({ mensagem: validacao.mensagem });
        }

        const clienteExistente = await clienteModel.findById(parsedId);
        if (!clienteExistente) {
            return res.status(404).json({ mensagem: "Cliente não encontrado." });
        }

        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = req.body;

        // Verifica duplicidade ignorando o próprio cliente em edição
        const conflito = await clienteModel.verificarExistencia(numeroProc, numeroPasta, parsedId);
        if (conflito) {
            if (numeroProc && conflito.numeroProc === numeroProc) {
                return res.status(400).json({ mensagem: 'Já existe outro cliente com este <span class="type-error">número de processo</span>' });
            }
            if (conflito.numeroPasta === Number(numeroPasta)) {
                return res.status(400).json({ mensagem: 'Já existe outro cliente com este <span class="type-error">número de pasta</span>' });
            }
        }

        await clienteModel.update(parsedId, {
            acao,
            nome,
            numeroPasta,
            tipo,
            numeroProc,
            status,
            descricao
        });

        return res.status(200).json({ mensagem: "Cliente atualizado com sucesso!" });
    } catch (error) {
        console.error(`Erro ao atualizar registro: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const deleteCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = Number(id);

        if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ mensagem: "ID do registro inválido." });
        }

        const resultado = await clienteModel.delete(parsedId);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ mensagem: 'O ID informado não existe no banco de dados.' });
        }

        return res.status(200).json({ mensagem: 'Registro excluído com sucesso' });
    } catch (error) {
        console.error(`Erro ao excluir registro: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const clienteController = {
    listClientes,
    createCliente,
    updateCliente,
    deleteCliente
};

export { clienteController };