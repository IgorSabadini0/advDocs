import { clienteModel } from '../models/clienteModel.js';
import { tipoProcessoModel } from '../models/tipoProcessoModel.js';
import { validateCliente } from '../validator/clientValidator.js';
import { buscarProcesso } from '../services/datajudServices.js';
import { agendarConsultaDatajud } from '../services/datajudBackgroundWorker.js';

const listClientes = async (req, res) => {
    try {
        const clientes = await clienteModel.list();
        return res.status(200).json(clientes);
    } catch (error) {
        console.error(`Erro ao puxar dados: ${error}`);
        return res.status(500).json({ mensagem: "Erro interno no servidor" });
    }
};

const getClienteById = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = Number(id);

        if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ mensagem: "ID do registro inválido." });
        }

        const cliente = await clienteModel.findById(parsedId);
        if (!cliente) {
            return res.status(404).json({ mensagem: "Pasta/cliente não encontrado." });
        }

        return res.status(200).json(cliente);
    } catch (error) {
        console.error(`Erro ao buscar cliente por ID: ${error}`);
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

const obterVinculoProcesso = async (req, res) => {
    try {
        const { numeroProc } = req.params;
        const numeroLimpo = String(numeroProc || '').replace(/\D/g, '');
        if (numeroLimpo.length !== 20) {
            return res.status(400).json({ mensagem: "Número do processo inválido. Informe os 20 dígitos do padrão CNJ." });
        }

        const [pastaVinculada, menorPastaDisponivel] = await Promise.all([
            clienteModel.findByNumeroProc(numeroLimpo),
            clienteModel.getMenorPastaDisponivel()
        ]);

        return res.status(200).json({ pastaVinculada, menorPastaDisponivel });
    } catch (error) {
        console.error(`Erro ao obter vínculo do processo: ${error}`);
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
            return res.status(409).json({ mensagem: "Já existe um tipo de processo cadastrado com este nome." });
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

        const {
            acao,
            nome,
            cpf_cnpj,
            telefone,
            email,
            numeroPasta,
            tipo,
            tipo_processo_id,
            consultarProcesso
        } = req.body;

        const numeroProc = req.body.numero_processo ?? req.body.numeroProc;
        const tribunal = req.body.tribunal;
        const comarca_vara = req.body.comarca_vara;
        const parte_contraria = req.body.parte_contraria;
        const status = req.body.status_pasta ?? req.body.status ?? 'Ativo';
        const descricao = req.body.observacoes ?? req.body.descricao;

        const procLimpo = String(numeroProc || '').replace(/\D/g, '');
        const deveConsultarDatajud = Boolean(consultarProcesso && procLimpo.length === 20);

        const resultado = await clienteModel.createWithCheck({
            acao,
            nome,
            cpf_cnpj,
            telefone,
            email,
            numeroPasta,
            tipo,
            tipo_processo_id,
            numeroProc,
            tribunal,
            comarca_vara,
            parte_contraria,
            status,
            descricao,
            datajud_status: deveConsultarDatajud ? 'pendente' : null,
            datajud_mensagem: deveConsultarDatajud ? 'Consulta ao DataJud em andamento...' : null
        });

        if (resultado.conflito) {
            const msg = resultado.campoConflito === 'numeroProc'
                ? 'Já existe outro cliente com este número de processo.'
                : 'Já existe outro cliente com este número de pasta.';
            return res.status(409).json({ mensagem: msg, campoConflito: resultado.campoConflito });
        }

        if (deveConsultarDatajud) {
            agendarConsultaDatajud({
                clienteId: resultado.insertId,
                usuarioId: req.usuarioId,
                numeroProcesso: numeroProc,
                tribunal
            });
        }

        return res.status(201).json({
            mensagem: deveConsultarDatajud
                ? "Pasta cadastrada! A consulta ao DataJud foi iniciada em segundo plano."
                : "Cliente cadastrado com sucesso!",
            id: resultado.insertId,
            datajud_status: deveConsultarDatajud ? 'pendente' : null
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
            if (err.code === 'INVALID_COURT' || err.code === 'INVALID_CNJ_LENGTH') {
                return res.status(400).json({ mensagem: err.message });
            }
            erroDatajud = err.message;
        }

        if (!processo && !pastaVinculada) {
            if (erroDatajud) {
                return res.status(502).json({
                    mensagem: erroDatajud
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
        if (error.code === 'INVALID_CNJ_LENGTH' || error.code === 'INVALID_COURT') {
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

        const {
            acao,
            nome,
            cpf_cnpj,
            telefone,
            email,
            numeroPasta,
            tipo,
            tipo_processo_id,
            tribunal,
            comarca_vara,
            parte_contraria
        } = req.body;
        const numeroProc = req.body.numero_processo ?? req.body.numeroProc;
        const status = req.body.status_pasta ?? req.body.status ?? 'Ativo';
        const descricao = req.body.observacoes ?? req.body.descricao;

        const procLimpo = String(numeroProc || '').replace(/\D/g, '');
        const deveConsultarDatajud = Boolean(req.body.consultarProcesso && procLimpo.length === 20);

        const resultado = await clienteModel.updateWithCheck(parsedId, {
            acao,
            nome,
            cpf_cnpj,
            telefone,
            email,
            numeroPasta,
            tipo,
            tipo_processo_id,
            numeroProc,
            tribunal,
            comarca_vara,
            parte_contraria,
            status,
            descricao,
            ...(deveConsultarDatajud
                ? { datajud_status: 'pendente', datajud_mensagem: 'Consulta ao DataJud em andamento...' }
                : {})
        });

        if (resultado.naoEncontrado) {
            return res.status(404).json({ mensagem: "Cliente não encontrado." });
        }

        if (resultado.conflito) {
            const msg = resultado.campoConflito === 'numeroProc'
                ? 'Já existe outro cliente com este número de processo.'
                : 'Já existe outro cliente com este número de pasta.';
            return res.status(409).json({ mensagem: msg, campoConflito: resultado.campoConflito });
        }

        if (deveConsultarDatajud) {
            agendarConsultaDatajud({
                clienteId: parsedId,
                usuarioId: req.usuarioId,
                numeroProcesso: numeroProc,
                tribunal
            });
        }

        return res.status(200).json({
            mensagem: deveConsultarDatajud
                ? "Pasta atualizada! A consulta ao DataJud foi iniciada em segundo plano."
                : "Cliente atualizado com sucesso!",
            datajud_status: deveConsultarDatajud ? 'pendente' : undefined
        });
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
    getClienteById,
    obterProximaPasta,
    obterVinculoProcesso,
    listTiposProcesso,
    createTipoProcesso,
    deleteTipoProcesso,
    createCliente,
    consultarProcessoCliente,
    updateCliente,
    deleteCliente
};

export { clienteController };
