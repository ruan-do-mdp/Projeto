require('dotenv').config();
// server.js — ponto de entrada do backend (Express)
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, initSchema, seedIfEmpty, factoryReset } = require('./db');
const { gerarToken, publicUser, requireAuth, requirePerm, requireDev } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// payload maior que o padrão por causa das fotos em base64
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ===================== AUTENTICAÇÃO ===================== */

app.post('/api/login', async (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE login = $1', [login]);
  const usuario = rows[0];
  if (!usuario) {
    return res.status(401).json({ erro: 'Credenciais inválidas.' });
  }
  const ok = await bcrypt.compare(senha, usuario.senha_hash);
  if (!ok) {
    return res.status(401).json({ erro: 'Credenciais inválidas.' });
  }
  const token = gerarToken(usuario);
  res.json({ token, usuario: publicUser(usuario) });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ usuario: publicUser(req.usuario) });
});

/* ===================== PESSOAS (FICHAS) ===================== */

// lista enxuta (sem foto) — usada na tela de Registros
app.get('/api/pessoas', requireAuth, requirePerm('ver_fichas'), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, nome, cpf FROM pessoas ORDER BY nome ASC'
  );
  res.json({ pessoas: rows });
});

// ficha completa (com foto) — usada ao abrir um registro específico
app.get('/api/pessoas/:id', requireAuth, requirePerm('ver_fichas'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM pessoas WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ erro: 'Registro não encontrado.' });
  res.json({ pessoa: rows[0] });
});

// criação de um novo registro — exclusiva do nível dev
app.post('/api/pessoas', requireAuth, requireDev, async (req, res) => {
  const { nome, cpf, nasc, mae, pai, cidade, altura, civil, foto, foto_passaporte } = req.body || {};
  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Informe ao menos o nome.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO pessoas (nome, cpf, nasc, mae, pai, cidade, altura, civil, foto, foto_passaporte)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [nome.trim(), cpf || null, nasc || null, mae || null, pai || null, cidade || null, altura || null, civil || null, foto || null, foto_passaporte || null]
  );
  res.status(201).json({ pessoa: rows[0] });
});

// edição de ficha (dados + fotos) — exclusiva do nível dev
app.put('/api/pessoas/:id', requireAuth, requireDev, async (req, res) => {
  const { nome, cpf, nasc, mae, pai, cidade, altura, civil, foto, foto_passaporte } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE pessoas SET nome=$1, cpf=$2, nasc=$3, mae=$4, pai=$5, cidade=$6, altura=$7, civil=$8, foto=$9, foto_passaporte=$10
     WHERE id=$11 RETURNING *`,
    [nome, cpf, nasc, mae, pai, cidade, altura, civil, foto || null, foto_passaporte || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ erro: 'Registro não encontrado.' });
  res.json({ pessoa: rows[0] });
});

// remoção de um registro — exclusiva do nível dev
app.delete('/api/pessoas/:id', requireAuth, requireDev, async (req, res) => {
  const { rows } = await pool.query('DELETE FROM pessoas WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ erro: 'Registro não encontrado.' });
  res.json({ ok: true });
});

/* ===================== USUÁRIOS (apenas DEV) ===================== */

app.get('/api/usuarios', requireAuth, requireDev, async (req, res) => {
  const { rows } = await pool.query('SELECT id, login, nome, cargo, nivel, permissoes FROM usuarios ORDER BY id ASC');
  res.json({ usuarios: rows });
});

app.post('/api/usuarios', requireAuth, requireDev, async (req, res) => {
  const { login, senha, nome, cargo, nivel, permissoes } = req.body || {};
  if (!login || !senha || !nome || !cargo || !nivel) {
    return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' });
  }
  if (!['admin', 'user'].includes(nivel)) {
    return res.status(400).json({ erro: 'Nível inválido.' });
  }
  const existe = await pool.query('SELECT 1 FROM usuarios WHERE login = $1', [login]);
  if (existe.rows.length) {
    return res.status(409).json({ erro: 'Este login já está em uso.' });
  }
  const hash = await bcrypt.hash(senha, 10);
  const perms = Array.isArray(permissoes) ? permissoes : [];
  const { rows } = await pool.query(
    `INSERT INTO usuarios (login, senha_hash, nome, cargo, nivel, permissoes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, login, nome, cargo, nivel, permissoes`,
    [login, hash, nome, cargo, nivel, perms]
  );
  res.status(201).json({ usuario: rows[0] });
});

app.put('/api/usuarios/:id', requireAuth, requireDev, async (req, res) => {
  const alvo = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
  if (!alvo.rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (alvo.rows[0].login === 'dev') {
    return res.status(403).json({ erro: 'A conta dev é protegida e não pode ser editada.' });
  }
  const { nome, cargo, nivel, senha } = req.body || {};
  if (!nome || !cargo || !nivel) {
    return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' });
  }
  if (!['admin', 'user'].includes(nivel)) {
    return res.status(400).json({ erro: 'Nível inválido.' });
  }
  let hash = alvo.rows[0].senha_hash;
  if (senha) hash = await bcrypt.hash(senha, 10);
  const { rows } = await pool.query(
    `UPDATE usuarios SET nome=$1, cargo=$2, nivel=$3, senha_hash=$4 WHERE id=$5
     RETURNING id, login, nome, cargo, nivel, permissoes`,
    [nome, cargo, nivel, hash, req.params.id]
  );
  res.json({ usuario: rows[0] });
});

app.put('/api/usuarios/:id/permissoes', requireAuth, requireDev, async (req, res) => {
  const { permissoes } = req.body || {};
  if (!Array.isArray(permissoes)) return res.status(400).json({ erro: 'Lista de permissões inválida.' });
  const alvo = await pool.query('SELECT login FROM usuarios WHERE id = $1', [req.params.id]);
  if (!alvo.rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (alvo.rows[0].login === 'dev') {
    return res.status(403).json({ erro: 'A conta dev já possui todas as permissões.' });
  }
  const { rows } = await pool.query(
    `UPDATE usuarios SET permissoes=$1 WHERE id=$2 RETURNING id, login, nome, cargo, nivel, permissoes`,
    [permissoes, req.params.id]
  );
  res.json({ usuario: rows[0] });
});

app.delete('/api/usuarios/:id', requireAuth, requireDev, async (req, res) => {
  const alvo = await pool.query('SELECT login FROM usuarios WHERE id = $1', [req.params.id]);
  if (!alvo.rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (alvo.rows[0].login === 'dev') {
    return res.status(403).json({ erro: 'A conta dev é protegida e não pode ser removida.' });
  }
  await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

/* ===================== RESTAURAR PADRÃO (apenas DEV) ===================== */

app.post('/api/reset', requireAuth, requireDev, async (req, res) => {
  await factoryReset();
  res.json({ ok: true });
});

/* ===================== START ===================== */

async function start() {
  await initSchema();
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`Advanced Company — Sistema v3.0 rodando na porta ${PORT}`);
  });
}

start().catch(err => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
