-- Migration 002: Seed idempotente de ícones padrão na tabela tipos_processo

UPDATE tipos_processo SET icone = 'fa-solid fa-scale-balanced' WHERE LOWER(TRIM(nome)) = 'civil' AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-person-cane' WHERE LOWER(TRIM(nome)) IN ('previdenciario', 'previdenciário') AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-briefcase' WHERE LOWER(TRIM(nome)) = 'trabalhista' AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-scroll' WHERE LOWER(TRIM(nome)) IN ('inventario', 'inventário') AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-people-roof' WHERE LOWER(TRIM(nome)) IN ('familia', 'família') AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-cart-shopping' WHERE LOWER(TRIM(nome)) = 'consumidor' AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-handcuffs' WHERE LOWER(TRIM(nome)) = 'criminal' AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-hospital' WHERE LOWER(TRIM(nome)) = 'santa casa' AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-hand-holding-dollar' WHERE LOWER(TRIM(nome)) IN ('justica gratuita', 'justiça gratuita') AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-box-archive' WHERE LOWER(TRIM(nome)) = 'arquivado' AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
UPDATE tipos_processo SET icone = 'fa-solid fa-file-lines' WHERE LOWER(TRIM(nome)) = 'outro' AND (icone IS NULL OR TRIM(icone) = '' OR icone = 'fa-solid fa-folder');
