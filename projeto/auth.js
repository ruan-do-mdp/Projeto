// auth.js — geração/validação de token (JWT) e middlewares de proteção de rotas
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.warn('AVISO: JWT_SECRET não definido. Usando um valor temporário — defina JWT_SECRET nas variáveis de ambiente em produção.');
}
const EFFECTIVE_SECRET = SECRET || 'troque-este-segredo-em-producao-advanced-company';

function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id }, EFFECTIVE_SECRET, { expiresIn: '7d' });
}

function publicUser(u) {
  return {
    id: u.id,
    login: u.login,
    nome: u.nome,
    cargo: u.cargo,
    nivel: u.nivel,
    permissoes: u.permissoes || []
  };
}

// Middleware: exige um token válido. Sempre busca o usuário atualizado no banco
// (assim, se o dev mudar as permissões de alguém, isso vale na hora, sem precisar logar de novo).
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ erro: 'Token ausente.' });

    const payload = jwt.verify(token, EFFECTIVE_SECRET);
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [payload.id]);
    if (!rows.length) return res.status(401).json({ erro: 'Usuário não encontrado.' });

    req.usuario = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

function requirePerm(permKey) {
  return (req, res, next) => {
    const perms = req.usuario.permissoes || [];
    if (!perms.includes(permKey)) {
      return res.status(403).json({ erro: 'Você não tem permissão para esta ação.' });
    }
    next();
  };
}

function requireDev(req, res, next) {
  if (req.usuario.nivel !== 'dev') {
    return res.status(403).json({ erro: 'Acesso restrito ao nível DEV.' });
  }
  next();
}

module.exports = { gerarToken, publicUser, requireAuth, requirePerm, requireDev };
