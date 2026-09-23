import { clienteModel } from '../models/clienteModel.js';
import { validateCliente } from '../validator/clientValidator.js'; // Importa a função de validação de cliente
import { buscarProcesso } from '../services/datajudServices.js'; // Importa a função buscarProcesso

export const listClientes = async (req, res) => {
    try {
        const clientes = await clienteModel.list();
        return res.status(200).json(clientes);
    } catch (error) {
        console.error(`Erro ao puxar dados: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

export const createCliente = async (req, res) => {
    try {
        const validacao = validateCliente(req.body); // envia os dados do body para a função de validação
        if (!validacao.valido) { // o .valido é vindo do return na função validateCliente, onde retorna um objeto com a propriedade 'valido' e 'mensagem'
            return res.status(400).json({ mensagem: validacao.mensagem });
        }

        const { acao, nome, numeroPasta, tipo, numeroProc, status, consultarProcesso, descricao } = req.body; // pega os dados do body da requisição

        if (consultarProcesso && numeroProc) {
            await buscarProcesso(numeroProc); // Chama a função para buscar o processo no DataJud
        }
        const registroExistente = await clienteModel.verificarExistencia(numeroProc, numeroPasta); // Verifica se já existe um cliente com o mesmo número de processo ou número de pasta
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

const clienteController = {
    listClientes,
    createCliente
};

export { clienteController };
export default clienteController;