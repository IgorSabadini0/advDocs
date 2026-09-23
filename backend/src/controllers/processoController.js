import { buscarProcesso, identificarTribunalCNJ } from '../services/datajudServices.js';

export const consultarProcesso = async (req, res) => {
    try {
        const { numeroProcesso } = req.params;

        if (!numeroProcesso) {
            return res.status(400).json({ mensagem: "O número do processo é obrigatório." });
        }

        const numeroLimpo = String(numeroProcesso).replace(/\D/g, '');

        if (numeroLimpo.length !== 20) {
            return res.status(400).json({
                mensagem: "Número de processo inválido. O padrão CNJ deve conter exatamente 20 dígitos (ex: 0000000-00.0000.0.00.0000)."
            });
        }

        const tribunalInfo = identificarTribunalCNJ(numeroLimpo);
        const dadosProcesso = await buscarProcesso(numeroLimpo);

        if (!dadosProcesso) {
            return res.status(404).json({
                mensagem: "Nenhum processo foi localizado com este número na base do tribunal correspondente.",
                tribunal: tribunalInfo ? tribunalInfo.sigla : null,
                tribunalNome: tribunalInfo ? tribunalInfo.nome : null
            });
        }

        return res.status(200).json(dadosProcesso);
    } catch (error) {
        console.error("Erro no controller ao consultar processo:", error.message);

        if (error.response?.status === 404) {
            return res.status(404).json({
                mensagem: "Tribunal ou base de dados não encontrada para o número informado."
            });
        }

        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            return res.status(504).json({
                mensagem: "Tempo limite esgotado ao consultar a base do DataJud. Por favor, tente novamente."
            });
        }

        return res.status(500).json({
            mensagem: "Erro ao consultar a API do DataJud. Tente novamente mais tarde."
        });
    }
};

export const obterInfoTribunalController = (req, res) => {
    const { numeroProcesso } = req.params;
    const info = identificarTribunalCNJ(numeroProcesso);
    if (!info) {
        return res.status(400).json({ mensagem: "Tribunal não identificado a partir do número informado." });
    }
    return res.status(200).json(info);
};

export const processoController = {
    consultarProcesso,
    obterInfoTribunalController
};
