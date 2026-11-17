import { db } from '../config/db.js';
import { dispararProcessamentoFila } from './processSyncQueueWorker.js';

let timerAgendamentoDiario = null;
const timersExecucaoFutura = new Set();

/**
 * Calcula quantos milissegundos faltam até a próxima execução no horário alvo (padrão 02:00 AM local).
 */
export const calcularMsAteProximaExecucao = (horaAlvo = 2, minutoAlvo = 0, agora = new Date()) => {
    const base = agora instanceof Date ? agora : new Date(agora);
    const proximo = new Date(base.getTime());
    proximo.setHours(horaAlvo, minutoAlvo, 0, 0);

    if (proximo.getTime() <= base.getTime()) {
        proximo.setDate(proximo.getDate() + 1);
    }

    return proximo.getTime() - base.getTime();
};

/**
 * Seleciona processos com monitoramento ativo cuja última sincronização ocorreu há mais de 24h
 * (ou nunca ocorreu) e que não possuem job pendente/em andamento na fila.
 */
export const selecionarProcessosElegiveisMonitoramento = async ({
    limite = 200,
    escritorioId = null
} = {}) => {
    const lim = Math.min(Math.max(Number(limite) || 200, 1), 1000);
    const filtroEscritorio = (escritorioId !== null && escritorioId !== undefined)
        ? 'AND p.escritorio_id = ?'
        : '';

    const params = [];
    if (filtroEscritorio) {
        params.push(Number(escritorioId));
    }
    params.push(lim);

    const [rows] = await db.query(`
        SELECT p.id, p.escritorio_id, p.numero_cnj, p.tribunal_sigla, p.instancia,
               p.ultima_sincronizacao_em,
               EXISTS (
                   SELECT 1 FROM credenciais_tribunal ct
                   WHERE ct.escritorio_id = p.escritorio_id
                     AND ct.tipo_autenticacao = 'CERTIFICADO_A1'
                     AND ct.ativo = TRUE
                     AND ct.status_credencial = 'VALIDA'
                     AND ct.tribunal_sigla IN (p.tribunal_sigla, 'GLOBAL')
               ) AS tem_certificado_a1
        FROM processos p
        WHERE p.monitoramento_ativo = TRUE
          AND (p.ultima_sincronizacao_em IS NULL OR p.ultima_sincronizacao_em < (NOW() - INTERVAL 24 HOUR))
          AND NOT EXISTS (
              SELECT 1 FROM jobs_sincronizacao j
              WHERE j.processo_id = p.id
                AND j.status IN ('EM_FILA', 'PROCESSANDO')
          )
          ${filtroEscritorio}
        ORDER BY p.ultima_sincronizacao_em IS NULL DESC, p.ultima_sincronizacao_em ASC, p.id ASC
        LIMIT ?
    `, params);

    return rows;
};

/**
 * Executa a varredura noturna distribuindo os jobs na fila de forma espaçada
 * (`proxima_execucao_em = NOW() + i * espacamentoSegundos`) para evitar sobrecarga nos tribunais.
 */
export const executarVarreduraNoturnaMonitoramento = async ({
    espacamentoSegundos = 15,
    limite = 200,
    escritorioId = null,
    dispararWorker = true
} = {}) => {
    const elegiveis = await selecionarProcessosElegiveisMonitoramento({ limite, escritorioId });
    if (elegiveis.length === 0) {
        return {
            total_enfileirados: 0,
            espacamento_segundos: Number(espacamentoSegundos) || 0,
            jobs: []
        };
    }

    const espaco = Math.max(0, Number(espacamentoSegundos) || 0);
    const jobsCriados = [];

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        for (let i = 0; i < elegiveis.length; i++) {
            const proc = elegiveis[i];
            const atrasoSeg = i * espaco;
            const fonte = (proc.tribunal_sigla === 'TRF3' && Boolean(proc.tem_certificado_a1))
                ? 'MNI'
                : 'DATAJUD';

            const [resJob] = await conn.query(`
                INSERT INTO jobs_sincronizacao (
                    processo_id, tipo_job, fonte_utilizada, status,
                    tentativa_atual, max_tentativas, proxima_execucao_em
                ) VALUES (?, 'SYNC_PROCESSO', ?, 'EM_FILA', 1, 5, DATE_ADD(NOW(), INTERVAL ? SECOND))
            `, [proc.id, fonte, atrasoSeg]);

            await conn.query(
                "UPDATE processos SET status_sincronizacao = 'PENDENTE' WHERE id = ?",
                [proc.id]
            );

            jobsCriados.push({
                job_id: resJob.insertId,
                processo_id: proc.id,
                numero_cnj: proc.numero_cnj,
                tribunal_sigla: proc.tribunal_sigla,
                fonte_utilizada: fonte,
                atraso_segundos: atrasoSeg
            });
        }

        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }

    if (dispararWorker && jobsCriados.length > 0) {
        dispararProcessamentoFila();

        // Agenda despertares futuros para jobs espaçados além de 0s
        for (const item of jobsCriados) {
            if (item.atraso_segundos > 0) {
                const timer = setTimeout(() => {
                    timersExecucaoFutura.delete(timer);
                    dispararProcessamentoFila();
                }, (item.atraso_segundos * 1000) + 100);
                if (typeof timer.unref === 'function') timer.unref();
                timersExecucaoFutura.add(timer);
            }
        }
    }

    return {
        total_enfileirados: jobsCriados.length,
        espacamento_segundos: espaco,
        jobs: jobsCriados
    };
};

/**
 * Inicia o Cron Job diário (padrão 02:00 AM) usando timers não-bloqueantes (`.unref()`).
 */
export const iniciarAgendadorMonitoramentoDiario = ({
    horaAlvo = 2,
    minutoAlvo = 0,
    espacamentoSegundos = 15
} = {}) => {
    pararAgendadorMonitoramentoDiario();

    const agendarProximoCiclo = () => {
        const delayMs = calcularMsAteProximaExecucao(horaAlvo, minutoAlvo);
        timerAgendamentoDiario = setTimeout(async () => {
            try {
                const res = await executarVarreduraNoturnaMonitoramento({ espacamentoSegundos });
                if (res.total_enfileirados > 0) {
                    console.log(`[MonitorCron] Varredura noturna enfileirou ${res.total_enfileirados} processo(s).`);
                }
            } catch (error) {
                console.error('[MonitorCron] Erro na varredura noturna de monitoramento:', error.message);
            } finally {
                agendarProximoCiclo();
            }
        }, delayMs);

        if (typeof timerAgendamentoDiario.unref === 'function') {
            timerAgendamentoDiario.unref();
        }
    };

    agendarProximoCiclo();
};

export const pararAgendadorMonitoramentoDiario = () => {
    if (timerAgendamentoDiario) {
        clearTimeout(timerAgendamentoDiario);
        timerAgendamentoDiario = null;
    }
    for (const timer of timersExecucaoFutura) {
        clearTimeout(timer);
    }
    timersExecucaoFutura.clear();
};

export const ProcessMonitorScheduler = {
    calcularMsAteProximaExecucao,
    selecionarProcessosElegiveisMonitoramento,
    executarVarreduraNoturnaMonitoramento,
    iniciarAgendadorMonitoramentoDiario,
    pararAgendadorMonitoramentoDiario
};

export default ProcessMonitorScheduler;
