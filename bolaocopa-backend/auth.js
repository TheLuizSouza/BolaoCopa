// auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (req, res, next) => {
  // O token geralmente vem no formato: "Bearer <token>"
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Erro no formato do token.' });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({ error: 'Token malformado.' });
  }

  // Verifica se o token é válido usando a nossa SECRET do .env
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    // Se o token for válido, anexamos o ID do usuário à requisição (req)
    // Assim, as rotas seguintes saberão exatamente quem está logado
    req.userId = decoded.id;
    return next(); // Segue para a rota principal
  });
};

module.exports = authMiddleware;