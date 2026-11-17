import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { db } from '../src/config/db.js';
import { runMigrations } from '../src/database/migrate.js';
import {
    tipoProcessoModel,
    ICONE_PADRAO_TIPO,
    validarENormalizarIconeTipo
} from '../src/models/tipoProcessoModel.js';
import { clienteModel } from '../src/models/clienteModel.js';
import clientesRouter from '../src/routes/clientes.js';

describe('Seletor de Ícones — Tipos de Processo (Migration, Model, Segurança e API)', () => {
    let server;
    let baseUrl;
    const idsTiposCriados = [];
    const idsClientesCriados = [];

    before(async () => {
        await runMigrations();

        const app = express();
        app.use(express.json());
        // Simula usuário autenticado com perfil Admin para testar rotas de clientes/tipos
        app.use((req, _res, next) => {
            req.usuarioId = 1;
            req.isAdmin = true;
            req.usuarioRole = 'admin';
            req.usuarioPoliticas = ['create_records', 'edit_records', 'delete_records'];
            next();
        });
        app.use('/clientes', clientesRouter);

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const { port } = server.address();
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        for (const clienteId of idsClientesCriados) {
            await db.query('DELETE FROM clientes WHERE id = ?', [clienteId]);
        }
        for (const tipoId of idsTiposCriados) {
            await db.query('DELETE FROM tipos_processo WHERE id = ?', [tipoId]);
        }
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await db.end();
    });

    it('runMigrations garante coluna icone em tipos_processo e seed idempotente dos tipos padrão', async () => {
        // Executa novamente para comprovar idempotência
        await runMigrations();

        const [cols] = await db.query(`
            SELECT COLUMN_NAME, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tipos_processo'
              AND COLUMN_NAME = 'icone'
        `);
        assert.equal(cols.length, 1);
        assert.equal(cols[0].COLUMN_DEFAULT, ICONE_PADRAO_TIPO);

        const lista = await tipoProcessoModel.list();
        const previd = lista.find(t => t.nome === 'Previdenciário');
        if (previd) {
            assert.equal(previd.icone, 'fa-solid fa-person-cane');
        }
    });

    it('validarENormalizarIconeTipo bloqueia XSS/injeção HTML e normaliza slugs válidos', () => {
        assert.deepEqual(validarENormalizarIconeTipo(undefined), { valido: true, icone: ICONE_PADRAO_TIPO });
        assert.deepEqual(validarENormalizarIconeTipo(''), { valido: true, icone: ICONE_PADRAO_TIPO });
        assert.deepEqual(validarENormalizarIconeTipo('fa-gavel'), { valido: true, icone: 'fa-solid fa-gavel' });
        assert.deepEqual(validarENormalizarIconeTipo('fa-solid   fa-scale-balanced'), {
            valido: true,
            icone: 'fa-solid fa-scale-balanced'
        });

        // Payloads maliciosos devem ser bloqueados
        assert.equal(validarENormalizarIconeTipo('"><script>alert(1)</script>').valido, false);
        assert.equal(validarENormalizarIconeTipo('fa-solid fa-gavel" onclick="alert(1)').valido, false);
        assert.equal(validarENormalizarIconeTipo('fa-solid').valido, false);
        assert.equal(validarENormalizarIconeTipo('bg-red-500 text-white').valido, false);
        assert.equal(validarENormalizarIconeTipo({ classe: 'fa-gavel' }).valido, false);
    });

    it('CRUD REST /clientes/tipos persiste, valida, edita icone/nome e propaga tipo_icone em clientes', async () => {
        // 1) Tentativa com XSS no campo icone deve retornar 400
        const badResp = await fetch(`${baseUrl}/clientes/tipos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: `Tipo Malicioso ${Date.now()}`,
                icone: 'fa-solid fa-folder"><img src=x onerror=alert(1)>'
            })
        });
        assert.equal(badResp.status, 400);

        // 2) Criação sem ícone aplica fallback padrão
        const nomeFallback = `Teste Fallback ${Date.now()}`;
        const createFallback = await fetch(`${baseUrl}/clientes/tipos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: nomeFallback })
        });
        assert.equal(createFallback.status, 201);
        const bodyFallback = await createFallback.json();
        idsTiposCriados.push(bodyFallback.id);
        assert.equal(bodyFallback.icone, ICONE_PADRAO_TIPO);

        // 3) Criação com ícone escolhido do catálogo
        const nomeCustom = `Ambiental Teste ${Date.now()}`;
        const createCustom = await fetch(`${baseUrl}/clientes/tipos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: nomeCustom,
                icone: 'fa-solid fa-shield-halved'
            })
        });
        assert.equal(createCustom.status, 201);
        const bodyCustom = await createCustom.json();
        idsTiposCriados.push(bodyCustom.id);
        assert.equal(bodyCustom.icone, 'fa-solid fa-shield-halved');

        // 4) Vincula uma pasta de cliente a esse tipo e confirma tipo_icone em list() e findById()
        const pastaLivre = (await clienteModel.getMenorPastaDisponivel()) + 50000;
        const createdCliente = await clienteModel.create({
            acao: 'Ação Civil Pública',
            nome: 'Cliente Ícone Teste',
            numeroPasta: pastaLivre,
            tipo: nomeCustom,
            tipo_processo_id: bodyCustom.id
        });
        idsClientesCriados.push(createdCliente.insertId);

        const detalheAntes = await clienteModel.findById(createdCliente.insertId);
        assert.equal(detalheAntes.tipo_icone, 'fa-solid fa-shield-halved');

        // 5) Atualiza nome e ícone via PUT /clientes/tipos/:id e verifica propagação
        const novoNome = `Tributário Atualizado ${Date.now()}`;
        const updateResp = await fetch(`${baseUrl}/clientes/tipos/${bodyCustom.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: novoNome,
                icone: 'fa-solid fa-sack-dollar'
            })
        });
        assert.equal(updateResp.status, 200);
        const bodyUpdate = await updateResp.json();
        assert.equal(bodyUpdate.nome, novoNome);
        assert.equal(bodyUpdate.icone, 'fa-solid fa-sack-dollar');

        const listaTipos = await (await fetch(`${baseUrl}/clientes/tipos`)).json();
        const atualizadoNaLista = listaTipos.find(t => t.id === bodyCustom.id);
        assert.equal(atualizadoNaLista.nome, novoNome);
        assert.equal(atualizadoNaLista.icone, 'fa-solid fa-sack-dollar');

        const listaClientes = await clienteModel.list();
        const clienteNaLista = listaClientes.find(c => c.id === createdCliente.insertId);
        assert.equal(clienteNaLista.tipo, novoNome);
        assert.equal(clienteNaLista.tipo_icone, 'fa-solid fa-sack-dollar');
    });
});
