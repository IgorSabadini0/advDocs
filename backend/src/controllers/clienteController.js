import { clienteModel } from '../models/clienteModel.js';
import { tipoProcessoModel } from '../models/tipoProcessoModel.js';
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

const obterProximaPasta = async (req, res) => {
    try {
        const numeroPasta = await clienteModel.getMenorPastaDisponivel();
        return res.status(200).json({ numeroPasta });
    } catch (error) {
        console.error(`Erro ao buscar menor pasta disponível: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const listTiposProcesso = async (req, res) => {
    try {
        const tipos = await tipoProcessoModel.list();
        return res.status(200).json(tipos);
    } catch (error) {
        console.error(`Erro ao puxar tipos de processo: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const createTipoProcesso = async (req, res) => {
    try {
        const { nome } = req.body;
        if (!nome || typeof nome !== 'string' || nome.trim().length === 0 || nome.trim().length > 64) {
            return res.status(400).json({ mensagem: "Nome do tipo de processo inválido (máximo 64 caracteres)." });
        }

        const nomeFormatado = nome.trim();
        const existente = await tipoProcessoModel.findByName(nomeFormatado);
        if (existente) {
            return res.status(400).json({ mensagem: "Já existe um tipo de processo cadastrado com este nome." });
        }

        const resultado = await tipoProcessoModel.create(nomeFormatado);
        return res.status(201).json({
            mensagem: "Tipo de processo cadastrado com sucesso!",
            id: resultado.insertId,
            nome: nomeFormatado
        });
    } catch (error) {
        console.error(`Erro ao criar tipo de processo: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const deleteTipoProcesso = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = Number(id);

        if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ mensagem: "ID do tipo de processo inválido." });
        }

        const tipoExistente = await tipoProcessoModel.findById(parsedId);
        if (!tipoExistente) {
            return res.status(404).json({ mensagem: "Tipo de processo não encontrado." });
        }

        const totalUso = await tipoProcessoModel.contarUsoEmClientes(tipoExistente.nome);
        if (totalUso > 0) {
            return res.status(400).json({
                mensagem: `Não é possível remover a categoria "${tipoExistente.nome}" pois existem ${totalUso} pasta(s) vinculada(s) a ela.`
            });
        }

        await tipoProcessoModel.delete(parsedId);
        return res.status(200).json({ mensagem: "Tipo de processo removido com sucesso!" });
    } catch (error) {
        console.error(`Erro ao excluir tipo de processo: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const createCliente = async (req, res) => {
    try {
        const validacao = validateCliente(req.body);
        if (!validacao.valido) {
            return res.status(400).json({ mensagem: validacao.mensagem });
        }

        let { acao, nome, numeroPasta, tipo, numeroProc, status, consultarProcesso, descricao } = req.body;

        const registroExistente = await clienteModel.verificarExistencia(numeroProc, numeroPasta);
        if (registroExistente) {
            if (numeroProc && registroExistente.numeroProc === numeroProc) {
                return res.status(400).json({ mensagem: 'Já existe outro cliente com este <span class="type-error">número de processo</span>' });
            }
            if (registroExistente.numeroPasta === Number(numeroPasta)) {
                return res.status(400).json({ mensagem: 'Já existe outro cliente com este <span class="type-error">número de pasta</span>' });
            }
        }

        let dadosProcesso = null;
        if (consultarProcesso && numeroProc) {
            try {
                dadosProcesso = await buscarProcesso(numeroProc);
                if (dadosProcesso && (!descricao || descricao.trim() === '')) {
                    const ultimoMov = dadosProcesso.ultimaMovimentacao
                        ? ` | Última mov.: ${dadosProcesso.ultimaMovimentacao.nome}`
                        : '';
                    descricao = `[DataJud ${dadosProcesso.tribunal}] Classe: ${dadosProcesso.classe} | Órgão: ${dadosProcesso.orgaoJulgador}${ultimoMov}`;
                }
            } catch (errDatajud) {
                console.warn(`Aviso na consulta DataJud durante cadastro: ${errDatajud.message}`);
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

        return res.status(201).json({
            mensagem: "Cliente cadastrado com sucesso!",
            id: resultado.insertId,
            processo: dadosProcesso
        });
    } catch (error) {
        console.error(`Erro ao registrar cadastro: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const consultarProcessoCliente = async (req, res) => {
    try {
        const { numeroProc } = req.params;
        const { tribunal } = req.query;

        const numeroLimpo = String(numeroProc || '').replace(/\D/g, '');
        if (numeroLimpo.length !== 20) {
            return res.status(400).json({
                mensagem: "Número do processo inválido. Informe os 20 dígitos do padrão CNJ."
            });
        }

        const [pastaVinculada, menorPastaDisponivel] = await Promise.all([
            clienteModel.findByNumeroProc(numeroProc),
            clienteModel.getMenorPastaDisponivel()
        ]);
        let processo = null;
        let erroDatajud = null;

        try {
            processo = await buscarProcesso(numeroLimpo, tribunal || null);
        } catch (err) {
            erroDatajud = err.message;
        }

        if (!processo && !pastaVinculada) {
            if (erroDatajud) {
                return res.status(502).json({
                    mensagem: "Erro ao comunicar com a API pública do DataJud (CNJ). Verifique sua conexão ou tente novamente."
                });
            }
            return res.status(404).json({
                mensagem: "Processo não encontrado na base pública do DataJud nem nas pastas do escritório."
            });
        }

        return res.status(200).json({
            processo,
            pastaVinculada,
            menorPastaDisponivel,
            aviso: erroDatajud || null
        });
    } catch (error) {
        console.error(`Erro ao consultar processo: ${error.message}`);
        if (error.code === 'INVALID_CNJ_LENGTH') {
            return res.status(400).json({ mensagem: error.message });
        }
        return res.status(502).json({
            mensagem: "Erro ao comunicar com a API pública do DataJud (CNJ). Verifique o número ou tente novamente."
        });
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
    obterProximaPasta,
    listTiposProcesso,
    createTipoProcesso,
    deleteTipoProcesso,
    createCliente,
    consultarProcessoCliente,
    updateCliente,
    deleteCliente
};

export { clienteController };
