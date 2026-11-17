import { db } from '../config/db.js';
import { PfxCertificateService } from '../services/pfxCertificateService.js';
import { ProcessMonitorScheduler } from '../services/processMonitorScheduler.js';

const resolverEscritorioId = (valor) => {
    const parsed = Number(valor);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

/**
 * GET /api/credenciais
 * Lista metadados das credenciais e certificados armazenados no cofre (sem segredos/PFX).
 */
const listarCredenciais = async (req, res) => {
    try {
        const escritorio_id = resolverEscritorioId(req.query?.escritorio_id);
        const credenciais = await PfxCertificateService.listarCredenciaisCofre({ escritorio_id });
        return res.status(200).json({ credenciais });
    } catch (error) {
        console.error('Erro ao listar credenciais do cofre:', error.message);
        return res.status(500).json({ mensagem: 'Erro interno ao listar credenciais.' });
    }
};

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

/**
 * POST /api/credenciais/login-portal
 * Armazena credencial CPF/Senha (+ seed TOTP 2FA opcional) criptografada para Fallback PJe/e-SAJ.
 */
const cadastrarLoginPortal = async (req, res) => {
    try {
        const {
            tribunal_sigla = 'TJSP',
            usuario,
            senha,
            totp_seed = null,
            escritorio_id = 1
        } = req.body || {};

        const credencial = await PfxCertificateService.salvarCredencialLoginPortal({
            escritorio_id,
            tribunal_sigla,
            usuario,
            senha,
            totp_seed
        });

        return res.status(201).json({
            mensagem: 'Credencial de portal armazenada com criptografia AES-256-GCM.',
            credencial
        });
    } catch (error) {
        if (error.code && (error.code.startsWith('MISSING_') || error.code.startsWith('INVALID_'))) {
            return res.status(400).json({ mensagem: error.message });
        }
        console.error('Erro ao salvar credencial de portal:', error.message);
        return res.status(500).json({ mensagem: 'Erro interno ao salvar credencial de portal.' });
    }
};

/**
 * PATCH /api/credenciais/:id/ativo
 */
const alternarAtivoCredencial = async (req, res) => {
    try {
        const escritorio_id = resolverEscritorioId(req.body?.escritorio_id ?? req.query?.escritorio_id);
        const { ativo } = req.body || {};
        if (typeof ativo !== 'boolean') {
            return res.status(400).json({ mensagem: 'Informe o campo booleano "ativo".' });
        }

        const atualizada = await PfxCertificateService.alterarStatusAtivoCredencial({
            id: req.params.id,
            escritorio_id,
            ativo
        });

        if (!atualizada) {
            return res.status(404).json({ mensagem: 'Credencial não encontrada.' });
        }

        return res.status(200).json({
            mensagem: atualizada.ativo ? 'Credencial ativada.' : 'Credencial desativada.',
            credencial: atualizada
        });
    } catch (error) {
        console.error('Erro ao alterar status da credencial:', error.message);
        return res.status(500).json({ mensagem: 'Erro interno ao atualizar credencial.' });
    }
};

/**
 * DELETE /api/credenciais/:id
 */
const removerCredencial = async (req, res) => {
    try {
        const escritorio_id = resolverEscritorioId(req.query?.escritorio_id);
        const removida = await PfxCertificateService.removerCredencialCofre({
            id: req.params.id,
            escritorio_id
        });

        if (!removida) {
            return res.status(404).json({ mensagem: 'Credencial não encontrada.' });
        }

        return res.status(200).json({ mensagem: 'Credencial removida do cofre com sucesso.' });
    } catch (error) {
        console.error('Erro ao remover credencial do cofre:', error.message);
        return res.status(500).json({ mensagem: 'Erro interno ao remover credencial.' });
    }
};

/**
 * GET /api/credenciais/resumo-motor
 * Retorna estatísticas do motor híbrido de processos e os últimos jobs executados na fila.
 */
const obterResumoMotor = async (req, res) => {
    try {
        const escritorio_id = resolverEscritorioId(req.query?.escritorio_id);

        const [[stats]] = await db.query(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN monitoramento_ativo = TRUE THEN 1 ELSE 0 END) AS monitorados,
                SUM(CASE WHEN status_sincronizacao = 'ATUALIZADO' THEN 1 ELSE 0 END) AS atualizados,
                SUM(CASE WHEN status_sincronizacao IN ('PENDENTE', 'SINCRONIZANDO') THEN 1 ELSE 0 END) AS em_fila,
                SUM(CASE WHEN status_sincronizacao IN ('ERRO', 'AGUARDANDO_CREDENCIAL') THEN 1 ELSE 0 END) AS com_erro
            FROM processos
            WHERE escritorio_id = ?
        `, [escritorio_id]);

        const [ultimosJobs] = await db.query(`
            SELECT j.id, j.processo_id, p.numero_cnj_formatado, p.tribunal_sigla,
                   j.tipo_job, j.fonte_utilizada, j.status,
                   j.tentativa_atual, j.max_tentativas,
                   j.novas_movimentacoes_inseridas, j.tempo_execucao_ms,
                   j.codigo_http_ou_soap, j.mensagem_erro,
                   j.criado_em, j.finalizado_em
            FROM jobs_sincronizacao j
            INNER JOIN processos p ON p.id = j.processo_id
            WHERE p.escritorio_id = ?
            ORDER BY j.id DESC
            LIMIT 12
        `, [escritorio_id]);

        return res.status(200).json({
            estatisticas: {
                total: Number(stats?.total || 0),
                monitorados: Number(stats?.monitorados || 0),
                atualizados: Number(stats?.atualizados || 0),
                em_fila: Number(stats?.em_fila || 0),
                com_erro: Number(stats?.com_erro || 0)
            },
            ultimos_jobs: ultimosJobs,
            agendamento: {
                horario_cron: '02:00',
                ativo: true
            }
        });
    } catch (error) {
        console.error('Erro ao obter resumo do motor processual:', error.message);
        return res.status(500).json({ mensagem: 'Erro interno ao consultar resumo do motor.' });
    }
};

/**
 * POST /api/credenciais/varredura-manual
 * Dispara manualmente a varredura do agendador noturno para processos > 24h sem sync.
 */
const executarVarreduraManual = async (req, res) => {
    try {
        const escritorioId = resolverEscritorioId(req.body?.escritorio_id ?? req.query?.escritorio_id);
        const resultado = await ProcessMonitorScheduler.executarVarreduraNoturnaMonitoramento({
            espacamentoSegundos: 5,
            escritorioId,
            dispararWorker: true
        });

        return res.status(202).json({
            mensagem: resultado.total_enfileirados > 0
                ? `${resultado.total_enfileirados} processo(s) enfileirado(s) para sincronização.`
                : 'Nenhum processo elegível (> 24h desde a última sincronização) no momento.',
            ...resultado
        });
    } catch (error) {
        console.error('Erro ao executar varredura manual:', error.message);
        return res.status(500).json({ mensagem: 'Erro interno ao iniciar varredura de monitoramento.' });
    }
};

export const credencialController = {
    listarCredenciais,
    cadastrarCertificadoA1,
    cadastrarLoginPortal,
    alternarAtivoCredencial,
    removerCredencial,
    obterResumoMotor,
    executarVarreduraManual
};

export default credencialController;
