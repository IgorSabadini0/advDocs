import { PfxCertificateService } from '../services/pfxCertificateService.js';

/**
 * POST /api/credenciais/certificado-a1
 * Recebe certificado .pfx (Base64) e senha, valida em memória extraindo CPF/CNPJ e validade,
 * criptografa com AES-256-GCM e persiste em `credenciais_tribunal`.
 */
const cadastrarCertificadoA1 = async (req, res) => {
    try {
        const {
            pfx_base64,
            senha,
            tribunal_sigla = 'TRF3',
            escritorio_id = 1,
            titular_cpf_cnpj = null
        } = req.body || {};

        if (!pfx_base64 || typeof pfx_base64 !== 'string') {
            return res.status(400).json({
                mensagem: 'O conteúdo do certificado .pfx em Base64 (pfx_base64) é obrigatório.'
            });
        }

        if (senha === undefined || senha === null || typeof senha !== 'string') {
            return res.status(400).json({
                mensagem: 'A senha do certificado digital (senha) é obrigatória.'
            });
        }

        const base64Limpo = pfx_base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
        if (!base64Limpo) {
            return res.status(400).json({ mensagem: 'Base64 do certificado .pfx inválido.' });
        }

        const pfxBuffer = Buffer.from(base64Limpo, 'base64');

        const credencial = await PfxCertificateService.salvarCertificadoA1NoCofre({
            escritorio_id,
            tribunal_sigla,
            pfxBuffer,
            senha,
            titular_cpf_cnpj
        });

        return res.status(201).json({
            mensagem: 'Certificado digital A1 validado e armazenado com segurança no cofre.',
            credencial
        });
    } catch (error) {
        if (error.code && (error.code.startsWith('INVALID_PFX') || error.code.startsWith('MISSING_'))) {
            return res.status(400).json({ mensagem: error.message });
        }
        console.error('Erro ao armazenar Certificado Digital A1:', error.message);
        return res.status(500).json({ mensagem: 'Erro interno ao processar certificado digital.' });
    }
};

export const credencialController = {
    cadastrarCertificadoA1
};

export default credencialController;
