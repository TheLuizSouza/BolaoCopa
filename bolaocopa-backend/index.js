// index.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./auth');
const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rota básica de teste
app.get('/', (req, res) => {
  res.send('API do Bolão da Copa rodando com sucesso!');
});

/* ==========================================
   ROTAS DE USUÁRIO E AUTENTICAÇÃO
   ========================================== */

// Rota para cadastrar um novo usuário
app.post('/users', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, total_points',
      [name, email, hashedPassword]
    );

    return res.status(201).json(newUser.rows[0]);
  } catch (error) {
    console.error(error.message);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// Rota de Login (Autenticação com cálculo de Ranking)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Verificar se o usuário existe pelo e-mail
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (userCheck.rows.length === 0) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const user = userCheck.rows[0];

    // 2. Comparar a senha digitada com a senha criptografada
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // 3. Gerar o Token JWT incluindo as permissões
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 4. Descobre a posição exata do usuário no ranking de pontos
    const positionCheck = await pool.query(`
      SELECT ranking_position FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, name ASC) as ranking_position
        FROM users
      ) AS ranked_users
      WHERE id = $1
    `, [user.id]);

    const position = positionCheck.rows[0]?.ranking_position || '-';

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        total_points: user.total_points,
        is_admin: user.is_admin,
        ranking_position: position
      },
      token: token
    });

  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao processar o login.' });
  }
});

// Rota para buscar o ranking geral dos usuários
app.get('/ranking', async (req, res) => {
  try {
    const ranking = await pool.query(
      'SELECT id, name, total_points FROM users ORDER BY total_points DESC, name ASC'
    );
    return res.json(ranking.rows);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao buscar o ranking.' });
  }
});


/* ==========================================
   ROTAS DE TIMES E PARTIDAS (MATCHES)
   ========================================== */

// Rota para listar todos os times cadastrados (Autocomplete)
app.get('/teams', async (req, res) => {
  try {
    const allTeams = await pool.query('SELECT id, name FROM teams ORDER BY name ASC');
    return res.json(allTeams.rows);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao buscar times.' });
  }
});

// Rota para listar partidas trazendo palpites e pontos do usuário logado
app.get('/matches', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId; 

    const queryText = `
      SELECT 
        m.*,
        t_a.name AS team_a_name,
        t_a.flag_url AS team_a_flag, 
        t_b.name AS team_b_name,
        t_b.flag_url AS team_b_flag, 
        g.guess_a,
        g.guess_b,
        g.guess_penalties_a,
        g.guess_penalties_b,
        g.points_gained AS points_earned 
      FROM matches m
      JOIN teams t_a ON m.team_a_id = t_a.id
      JOIN teams t_b ON m.team_b_id = t_b.id
      LEFT JOIN guesses g ON g.match_id = m.id AND g.user_id = $1
      ORDER BY m.match_date ASC
    `;

    const matchesResult = await pool.query(queryText, [userId]);
    return res.json(matchesResult.rows);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao buscar partidas.' });
  }
});


/* ==========================================
   ROTAS EXCLUSIVAS DO ADMINISTRADOR
   ========================================== */

// CORRIGIDO: Rota de criação de jogos (Agora salvando a coluna is_knockout corretamente)
app.post('/matches', authMiddleware, async (req, res) => {
  try {
    const userCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!userCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { team_a_id, team_b_id, match_date, is_knockout } = req.body;
    
    const newMatch = await pool.query(
      'INSERT INTO matches (team_a_id, team_b_id, match_date, is_knockout) VALUES ($1, $2, $3, $4) RETURNING *',
      [team_a_id, team_b_id, match_date, is_knockout || false]
    );

    return res.status(201).json(newMatch.rows[0]);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao cadastrar partida.' });
  }
});

// Rota para atualizar dados básicos de uma partida
app.put('/matches/:id', authMiddleware, async (req, res) => {
  try {
    const userCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!userCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { id } = req.params;
    const { goals_a, goals_b, status, match_date } = req.body;

    const updatedMatch = await pool.query(
      `UPDATE matches 
       SET goals_a = $1, goals_b = $2, status = $3, match_date = $4 
       WHERE id = $5 RETURNING *`,
      [
        goals_a === '' ? null : goals_a, 
        goals_b === '' ? null : goals_b, 
        status, 
        match_date, 
        id
      ]
    );

    if (updatedMatch.rowCount === 0) {
      return res.status(404).json({ error: 'Partida não encontrada.' });
    }

    return res.json(updatedMatch.rows[0]);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao atualizar partida.' });
  }
});

// Rota para deletar uma partida
app.delete('/matches/:id', authMiddleware, async (req, res) => {
  try {
    const userCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!userCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { id } = req.params;
    const deleteMatch = await pool.query('DELETE FROM matches WHERE id = $1 RETURNING *', [id]);

    if (deleteMatch.rowCount === 0) {
      return res.status(404).json({ error: 'Partida não encontrada.' });
    }

    return res.json({ message: 'Partida deletada com sucesso!', match: deleteMatch.rows[0] });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao deletar partida.' });
  }
});

// Rota para encerrar um jogo de vez e computar os pontos de todo mundo
app.post('/matches/:id/finish', authMiddleware, async (req, res) => {
  const matchId = req.params.id;
  const { goals_a, goals_b, penalties_a, penalties_b } = req.body;

  try {
    const userCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!userCheck.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    
    // Ajuste preventivo para tratar strings vazias vindas do front como nulas no banco
    const pA = (penalties_a === '' || penalties_a === undefined) ? null : Number(penalties_a);
    const pB = (penalties_b === '' || penalties_b === undefined) ? null : Number(penalties_b);

    const updateMatch = await pool.query(
      `UPDATE matches 
       SET goals_a = $1, goals_b = $2, penalties_a = $3, penalties_b = $4, status = 'FINISHED' 
       WHERE id = $5 
       RETURNING *`,
      [Number(goals_a), Number(goals_b), pA, pB, matchId]
    );

    if (updateMatch.rows.length === 0) {
      return res.status(404).json({ error: 'Jogo não encontrado.' });
    }

    const guesses = await pool.query('SELECT * FROM guesses WHERE match_id = $1', [matchId]);

    for (let guess of guesses.rows) {
      let pointsGained = 0;
      const gA = guess.guess_a;
      const gB = guess.guess_b;

      // 1. Lógica Padrão de Pontos (Tempo Regulamentar/Prorrogação)
      if (gA === Number(goals_a) && gB === Number(goals_b)) {
        pointsGained = 25; 
      } else if (
        (gA > gB && Number(goals_a) > Number(goals_b)) || 
        (gA < gB && Number(goals_a) < Number(goals_b)) || 
        (gA === gB && Number(goals_a) === Number(goals_b))
      ) {
        pointsGained = 10; 
      }

      // 2. Lógica de Bônus de Pênaltis (Se o jogo real empatou no mata-mata)
      if (Number(goals_a) === Number(goals_b) && updateMatch.rows[0].is_knockout) {
        if (pA !== null && pB !== null && guess.guess_penalties_a !== null && guess.guess_penalties_b !== null) {
          const realPenaltyWinner = pA > pB ? 'A' : 'B';
          const userPenaltyWinner = guess.guess_penalties_a > guess.guess_penalties_b ? 'A' : 'B';
          
          if (realPenaltyWinner === userPenaltyWinner) {
            pointsGained += 5; // +5 pontos bônus por acertar quem passou
          }
        }
      }

      await pool.query('UPDATE guesses SET points_gained = $1 WHERE id = $2', [pointsGained, guess.id]);
      await pool.query('UPDATE users SET total_points = total_points + $1 WHERE id = $2', [pointsGained, guess.user_id]);
    }

    return res.json({ 
      message: 'Jogo encerrado com cálculo de mata-mata concluído!', 
      match: updateMatch.rows[0]
    });

  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao encerrar jogo e computar pontos.' });
  }
});


/* ==========================================
   ROTAS DE PALPITES DOS JOGADORES (GUESSES)
   ========================================== */

// Rota de palpites protegida pelo middleware
app.post('/guesses', authMiddleware, async (req, res) => {
  const { match_id, guess_a, guess_b, guess_penalties_a, guess_penalties_b } = req.body;
  const user_id = req.userId; 

  try {
    const matchCheck = await pool.query('SELECT match_date FROM matches WHERE id = $1', [match_id]);
    if (matchCheck.rows.length === 0) return res.status(404).json({ error: 'Jogo não encontrado.' });

    if (new Date() >= new Date(matchCheck.rows[0].match_date)) {
      return res.status(400).json({ error: 'As apostas para este jogo já foram encerradas!' });
    }

    const queryText = `
      INSERT INTO guesses (user_id, match_id, guess_a, guess_b, guess_penalties_a, guess_penalties_b) 
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, match_id) 
      DO UPDATE SET 
        guess_a = EXCLUDED.guess_a, 
        guess_b = EXCLUDED.guess_b,
        guess_penalties_a = EXCLUDED.guess_penalties_a,
        guess_penalties_b = EXCLUDED.guess_penalties_b
      RETURNING *
    `;

    const savedGuess = await pool.query(queryText, [
      user_id, 
      match_id, 
      guess_a, 
      guess_b, 
      guess_penalties_a === '' ? null : guess_penalties_a, 
      guess_penalties_b === '' ? null : guess_penalties_b
    ]);
    return res.status(201).json(savedGuess.rows[0]);
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Erro ao salvar palpite.' });
  }
});

/* ==========================================
   INICIALIZAÇÃO DO SERVIDOR
   ========================================== */
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});