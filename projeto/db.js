// db.js — conexão com o Postgres, criação das tabelas e dados iniciais (seed)
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('ERRO: variável de ambiente DATABASE_URL não definida.');
  console.error('No Railway/Render, adicione um banco PostgreSQL ao projeto — a URL é injetada automaticamente.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

const PLIST_KEYS = ['ver_fichas', 'baixar_pdf', 'editar_dados', 'editar_fichas', 'gerenciar_usuarios'];

const LEVEL_PERMS = {
  dev: [...PLIST_KEYS],
  admin: ['ver_fichas', 'baixar_pdf', 'editar_fichas'],
  user: ['ver_fichas']
};

// ---------- geração determinística das 50 pessoas de exemplo (mock) ----------
const PRIMEIRO_NOMES = ["Ricardo", "Fernanda", "Marcos", "Juliana", "Eduardo", "Camila", "Rodrigo", "Patrícia", "Bruno", "Tatiane", "Felipe", "Aline", "Diego", "Vanessa", "Thiago", "Larissa", "Gustavo", "Renata", "Leonardo", "Bianca", "Rafael", "Carla", "André", "Débora", "Vinícius"];
const SOBRENOMES = ["Almeida", "Barbosa", "Carvalho", "Dias", "Esteves", "Ferreira", "Gomes", "Henriques", "Igreja", "Junqueira", "Klein", "Lopes", "Martins", "Nogueira", "Oliveira", "Pereira", "Quintana", "Ribeiro", "Souza", "Teixeira"];
const CIDADES = ["São Paulo, SP", "Rio de Janeiro, RJ", "Belo Horizonte, MG", "Curitiba, PR", "Porto Alegre, RS", "Salvador, BA", "Recife, PE", "Brasília, DF", "Fortaleza, CE", "Manaus, AM"];
const ESTADO_CIVIL = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"];

function pad(n, len) { return String(n).padStart(len, '0'); }

function gerarCPFFicticio(seed) {
  const n = Math.abs((seed * 9176 + 13417) % 999999999);
  const s = pad(n, 9);
  const d = pad((seed * 7 + 3) % 99, 2);
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${d}`;
}

function gerarPessoas() {
  const arr = [];
  for (let i = 0; i < 50; i++) {
    const pn = PRIMEIRO_NOMES[i % PRIMEIRO_NOMES.length];
    const sn = SOBRENOMES[(i * 3 + 1) % SOBRENOMES.length];
    const sn2 = SOBRENOMES[(i * 7 + 2) % SOBRENOMES.length];
    const nome = `${pn} ${sn} ${sn2}`;
    const maePn = PRIMEIRO_NOMES[(i * 5 + 2) % PRIMEIRO_NOMES.length];
    const paiPn = PRIMEIRO_NOMES[(i * 11 + 4) % PRIMEIRO_NOMES.length];
    const mae = `${maePn} ${sn} ${SOBRENOMES[(i * 2 + 5) % SOBRENOMES.length]}`;
    const pai = `${paiPn} ${SOBRENOMES[(i * 4 + 1) % SOBRENOMES.length]} ${sn2}`;
    const ano = 1965 + (i * 1) % 40;
    const mes = pad(1 + (i * 3) % 12, 2);
    const dia = pad(1 + (i * 7) % 28, 2);
    const nasc = `${dia}/${mes}/${ano}`;
    const cidade = CIDADES[i % CIDADES.length];
    const altura = (1.55 + ((i * 0.013) % 0.40)).toFixed(2) + ' m';
    const civil = ESTADO_CIVIL[i % ESTADO_CIVIL.length];
    arr.push({ nome, cpf: gerarCPFFicticio(i + 1), nasc, mae, pai, cidade, altura, civil });
  }
  return arr;
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      login TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      nome TEXT NOT NULL,
      cargo TEXT NOT NULL,
      nivel TEXT NOT NULL CHECK (nivel IN ('dev','admin','user')),
      permissoes TEXT[] NOT NULL DEFAULT '{}'
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pessoas (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      cpf TEXT,
      nasc TEXT,
      mae TEXT,
      pai TEXT,
      cidade TEXT,
      altura TEXT,
      civil TEXT,
      foto TEXT,
      foto_passaporte TEXT
    );
  `);
  // migração segura para bancos já existentes que ainda não têm essa coluna
  await pool.query(`ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS foto_passaporte TEXT;`);
}

async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
  if (rows[0].n > 0) return; // já tem dados, não mexe

  console.log('Banco vazio — inserindo dados padrão de fábrica...');

  const devHash = await bcrypt.hash('dev123', 10);
  const adminHash = await bcrypt.hash('admin123', 10);
  const userHash = await bcrypt.hash('user123', 10);

  await pool.query(
    `INSERT INTO usuarios (login, senha_hash, nome, cargo, nivel, permissoes) VALUES
     ($1,$2,$3,$4,$5,$6), ($7,$8,$9,$10,$11,$12), ($13,$14,$15,$16,$17,$18)`,
    [
      'dev', devHash, 'Desenvolvedor Root', 'Desenvolvedor', 'dev', LEVEL_PERMS.dev,
      'admin', adminHash, 'Administrador', 'Administrador', 'admin', LEVEL_PERMS.admin,
      'usuario', userHash, 'Operador Padrão', 'Operador', 'user', LEVEL_PERMS.user
    ]
  );

  const pessoas = gerarPessoas();
  for (const p of pessoas) {
    await pool.query(
      `INSERT INTO pessoas (nome, cpf, nasc, mae, pai, cidade, altura, civil) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.nome, p.cpf, p.nasc, p.mae, p.pai, p.cidade, p.altura, p.civil]
    );
  }
  console.log(`Seed concluído: 3 usuários e ${pessoas.length} pessoas.`);
}

async function factoryReset() {
  await pool.query('TRUNCATE usuarios, pessoas RESTART IDENTITY');
  await seedIfEmpty();
}

module.exports = { pool, initSchema, seedIfEmpty, factoryReset, PLIST_KEYS, LEVEL_PERMS };
