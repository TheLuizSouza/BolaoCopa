// src/App.jsx
import { useState, useEffect } from 'react';
import api from './services/api';

function App() {
  // Estados de Autenticação / Formulários
  const [isRegistering, setIsRegistering] = useState(false); 
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  
  // Estados dos Jogos e Palpites
  const [matches, setMatches] = useState([]);
  const [guesses, setGuesses] = useState({});
  const [teamsList, setTeamsList] = useState([]);
  const [isKnockout, setIsKnockout] = useState(false);

  // Estados do Admin
  const [activeTab, setActiveTab] = useState('palpites'); 
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [adminScores, setAdminScores] = useState({});

  const loadInitialData = async () => {
    try {
      const token = localStorage.getItem('@BolaoCopa:token');
      if (!token) return;

      const config = { headers: { Authorization: `Bearer ${token}` } };
      const matchesResponse = await api.get('/matches', config);
      
      console.log("Dados recebidos da API (/matches):", matchesResponse.data);
      setMatches(matchesResponse.data);

      // Alimenta o estado 'guesses' garantindo consistência total de dados e pênaltis
      const savedGuesses = {};
      matchesResponse.data.forEach(match => {
        if (match.guess_a !== null && match.guess_a !== undefined && match.guess_b !== null && match.guess_b !== undefined) {
          savedGuesses[match.id] = {
            guess_a: Number(match.guess_a),
            guess_b: Number(match.guess_b),
            guess_penalties_a: match.guess_penalties_a !== null ? Number(match.guess_penalties_a) : '',
            guess_penalties_b: match.guess_penalties_b !== null ? Number(match.guess_penalties_b) : '',
          };
        }
      });
      
      setGuesses(savedGuesses);

      if (user?.is_admin) {
        const teamsResponse = await api.get('/teams', config);
        setTeamsList(teamsResponse.data);
        
        const initialScores = {};
        matchesResponse.data.forEach(match => {
          initialScores[match.id] = {
            goals_a: match.goals_a ?? '',
            goals_b: match.goals_b ?? '',
            penalties_a: match.penalties_a ?? '',
            penalties_b: match.penalties_b ?? ''
          };
        });
        setAdminScores(initialScores);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do bolão:', err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('@BolaoCopa:token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      loadInitialData();
    } else {
      setGuesses({});
    }
  }, [user]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await api.post('/login', { email, password });
      localStorage.setItem('@BolaoCopa:token', response.data.token);
      setUser(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao tentar fazer login.');
    }
  };

  const handleLogout = () => {
    const confirmar = window.confirm('Deseja realmente sair?');
    if (!confirmar) return;

    localStorage.removeItem('@BolaoCopa:token'); 
    setUser(null); 
    setGuesses({});
    setActiveTab('palpites'); 
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/users', { name, email, password });
      alert('Conta criada com sucesso! Faça seu login para iniciar.');
      setName('');
      setIsRegistering(false); 
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao tentar criar conta.');
    }
  };

  const handleInputChange = (matchId, team, value) => {
    setGuesses((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [team]: value === '' ? '' : Number(value) },
    }));
  };

  const handleAdminScoreChange = (matchId, team, value) => {
    setAdminScores((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [team]: value === '' ? '' : Number(value) }
    }));
  };

  const handleSaveGuess = async (matchId) => {
    const matchGuess = guesses[matchId];
    if (!matchGuess || matchGuess.guess_a === undefined || matchGuess.guess_b === undefined || matchGuess.guess_a === '' || matchGuess.guess_b === '') {
      alert('Por favor, preencha ambos os placares.');
      return;
    }

    // Se for mata-mata e houver empate nos palpites, obriga a preencher os pênaltis
    const matchData = matches.find(m => m.id === matchId);
    if (matchData?.is_knockout && Number(matchGuess.guess_a) === Number(matchGuess.guess_b)) {
      if (matchGuess.guess_penalties_a === undefined || matchGuess.guess_penalties_b === undefined || matchGuess.guess_penalties_a === '' || matchGuess.guess_penalties_b === '') {
        alert('Em jogos de mata-mata com empate, defina quem se classifica nos pênaltis!');
        return;
      }
      if (Number(matchGuess.guess_penalties_a) === Number(matchGuess.guess_penalties_b)) {
        alert('A disputa de pênaltis não pode terminar empatada!');
        return;
      }
    }

    try {
      await api.post('/guesses', {
        match_id: matchId,
        guess_a: matchGuess.guess_a,
        guess_b: matchGuess.guess_b,
        guess_penalties_a: matchGuess.guess_penalties_a !== '' ? matchGuess.guess_penalties_a : null,
        guess_penalties_b: matchGuess.guess_penalties_b !== '' ? matchGuess.guess_penalties_b : null,
      });
      alert('Palpite salvo com sucesso!');
      loadInitialData();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar palpite.');
    }
  };

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    const selectedTeamA = teamsList.find(t => t.name.toLowerCase() === teamAName.trim().toLowerCase());
    const selectedTeamB = teamsList.find(t => t.name.toLowerCase() === teamBName.trim().toLowerCase());

    if (!selectedTeamA || !selectedTeamB) {
      alert('Uma ou ambas as seleções não foram encontradas.');
      return;
    }

    try {
      await api.post('/matches', {
        team_a_id: selectedTeamA.id,
        team_b_id: selectedTeamB.id,
        match_date: matchDate,
        is_knockout: isKnockout,
      });
      alert('Partida cadastrada com sucesso!');
      setTeamAName('');
      setTeamBName('');
      setMatchDate('');
      setIsKnockout(false);
      loadInitialData();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao cadastrar jogo.');
    }
  };

  const handleFinishMatch = async (match) => {
    const score = adminScores[match.id];
    if (score?.goals_a === undefined || score?.goals_b === undefined || score.goals_a === '' || score.goals_b === '') {
      alert('Por favor, preencha o placar final.');
      return;
    }

    // Validação de pênaltis se o jogo real empatar em fase eliminatória
    if (match.is_knockout && Number(score.goals_a) === Number(score.goals_b)) {
      if (score.penalties_a === '' || score.penalties_b === '' || Number(score.penalties_a) === Number(score.penalties_b)) {
        alert('Defina um vencedor para as penalidades oficiais.');
        return;
      }
    }

    const confirmar = window.confirm(`Encerrar jogo com o placar informado? Isso irá computar os pontos de todos os usuários.`);
    if (!confirmar) return;

    try {
      await api.post(`/matches/${match.id}/finish`, {
        goals_a: score.goals_a,
        goals_b: score.goals_b,
        penalties_a: score.penalties_a !== '' ? score.penalties_a : null,
        penalties_b: score.penalties_b !== '' ? score.penalties_b : null
      });
      alert('Partida encerrada e pontos computados com sucesso!');
      loadInitialData();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao encerrar partida.');
    }
  };

  const handleDeleteMatch = async (matchId, teamA, teamB) => {
    const confirmar = window.confirm(`Deletar o jogo ${teamA} x ${teamB}?`);
    if (!confirmar) return;

    try {
      await api.delete(`/matches/${matchId}`);
      alert('Partida removida!');
      loadInitialData();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao deletar partida.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-start p-6">
      <header className="w-full max-w-4xl text-center my-4">
        <h1 className="text-4xl font-extrabold text-yellow-400 drop-shadow">🏆 Copa 2026</h1>
        
        {user && user.is_admin && (
          <div className="flex justify-center gap-1 mt-6">
            <button 
              onClick={() => setActiveTab('palpites')}
              className={`px-4 py-2 font-bold rounded transition ${activeTab === 'palpites' ? 'bg-yellow-500 text-slate-900' : 'bg-slate-800 text-slate-400'}`}
            >
              Palpites
            </button>
            <button 
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 font-bold rounded transition ${activeTab === 'admin' ? 'bg-red-600 text-white border border-red-500' : 'bg-slate-800 text-slate-400'}`}
            >
              Admin ⚙️
            </button>
          </div>
        )}
      </header>

      <main className="w-full max-w-4xl flex justify-center">
        {!user ? (
          <div className="w-full max-w-md bg-slate-800 p-8 rounded-lg shadow-xl border border-slate-700">
            <h2 className="text-2xl font-bold text-center mb-6">
              {isRegistering ? 'Criar nova conta' : 'Acessar conta'}
            </h2>
            
            <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
              {error && <div className="p-3 bg-red-500/20 border border-red-500 text-red-400 text-sm rounded">{error}</div>}
              
              {isRegistering && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Seu nome completo</label>
                  <input type="text" placeholder="Edson Arantes do Nascimento" className="w-full p-2.5 rounded bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-yellow-400" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">E-mail</label>
                <input type="email" placeholder="pele@melhorquemaradona.com" className="w-full p-2.5 rounded bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-yellow-400" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Senha</label>
                <input type="password" placeholder="••••••••" className="w-full p-2.5 rounded bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-yellow-400" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <button type="submit" className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold rounded cursor-pointer transition">
                {isRegistering ? 'Cadastrar no Bolão' : 'Entrar no Bolão'}
              </button>
            </form>

            <div className="mt-6 text-center border-t border-slate-700 pt-4">
              <button 
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                }}
                className="text-sm text-yellow-400 hover:underline cursor-pointer"
              >
                {isRegistering ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se gratuitamente'}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* PERFIL LATERAL */}
            <div className="md:col-span-1 bg-slate-800 p-6 rounded-lg shadow-xl border border-slate-700 h-fit flex flex-col justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-yellow-400 mb-4">Perfil</h2>
                <div className="space-y-2 text-sm">
                  <p><span className="text-slate-400">Nome:</span> {user.name}</p>
                  <p><span className="text-slate-400">Pontos:</span> <span className="font-bold text-green-400">{user.total_points} pts</span></p>
                  <p>
                    <span className="text-slate-400">Ranking:</span>{' '}
                    <span className="font-bold text-yellow-400"> #{user.ranking_position}º</span>
                  </p>
                  <p><span className="text-slate-400">Tipo:</span> {user.is_admin ? <span className="text-red-400 font-bold">Administrador</span> : 'Jogador'}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="w-full py-2 bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white text-sm font-bold rounded border border-slate-600 hover:border-red-500 transition duration-150 cursor-pointer text-center"
              >
                Sair
              </button>
            </div>

            {/* ABAS DE CONTEÚDO */}
            <div className="md:col-span-2 w-200">
              {activeTab === 'palpites' ? (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold mb-4 text-slate-200">Próximas partidas</h2>
                  {matches.length === 0 ? (
                    <p className="text-slate-500 italic">Nenhuma partida cadastrada.</p>
                  ) : (
                    matches.map((match) => (
                      <div key={match.id} className="bg-slate-800 p-5 rounded-lg shadow-md border border-slate-700 flex flex-col items-center justify-between gap-4 w-200">
                        
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-200">
                          {/* Data do Jogo */}
                          <div className="text-center md:text-left min-w-[80px]">
                            <span className="text-xs font-semibold bg-slate-700 text-slate-300 px-2 py-1 rounded whitespace-nowrap">
                              {new Date(match.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {match.is_knockout && (
                              <span className="block text-[10px] mt-1 bg-red-950 text-red-400 border border-red-900 font-bold px-1 py-0.5 rounded text-center uppercase tracking-wider">Mata-Mata</span>
                            )}
                          </div>

                          {/* Interface de Aposta (Central) */}
                          <div className="flex flex-col items-center justify-center flex-1 w-200 max-w-xl">
                            <div className="flex items-center gap-3 font-semibold text-lg justify-center w-200">
                              <div className="flex items-center gap-2 flex-1 justify-end min-w-[120px]">
                                <span className="text-right text-base">{match.team_a_name}</span>
                                <img src={match.team_a_flag} alt="" className="w-6 h-4 object-cover rounded shadow-sm border border-slate-600 flex-shrink-0" />
                              </div>
                              
                              <input 
                                type="number" 
                                placeholder="0" 
                                className="w-12 p-1.5 text-center bg-slate-900 border border-slate-600 rounded text-yellow-400 font-bold" 
                                value={guesses[match.id]?.guess_a ?? ''} 
                                onChange={(e) => handleInputChange(match.id, 'guess_a', e.target.value)} 
                                disabled={match.status === 'FINISHED'} 
                              />

                              <span className="text-slate-500 text-sm flex-shrink-0">X</span>

                              <input 
                                type="number" 
                                placeholder="0" 
                                className="w-12 p-1.5 text-center bg-slate-900 border border-slate-600 rounded text-yellow-400 font-bold" 
                                value={guesses[match.id]?.guess_b ?? ''} 
                                onChange={(e) => handleInputChange(match.id, 'guess_b', e.target.value)} 
                                disabled={match.status === 'FINISHED'} 
                              />
                              
                              <div className="flex items-center gap-2 flex-1 justify-start min-w-[120px]">
                                <img src={match.team_b_flag} alt="" className="w-6 h-4 object-cover rounded shadow-sm border border-slate-600 flex-shrink-0" />
                                <span className="text-left text-base">{match.team_b_name}</span>
                              </div>
                            </div>

                            {/* Sub-bloco Dinâmico de Pênaltis para o Jogador */}
                            {match.is_knockout && guesses[match.id]?.guess_a === guesses[match.id]?.guess_b && guesses[match.id]?.guess_a !== '' && guesses[match.id]?.guess_a !== undefined && (
                              <div className="flex items-center gap-2 mt-2 bg-slate-900/60 p-2 rounded border border-dashed border-slate-600">
                                <span className="text-xs text-yellow-400 font-bold">Disputa de Pênaltis:</span>
                                <input 
                                  type="number" 
                                  placeholder="A" 
                                  className="w-10 p-1 text-center bg-slate-800 text-xs border border-slate-600 text-white rounded font-bold" 
                                  value={guesses[match.id]?.guess_penalties_a ?? ''} 
                                  onChange={(e) => handleInputChange(match.id, 'guess_penalties_a', e.target.value)}
                                  disabled={match.status === 'FINISHED'}
                                />
                                <span className="text-slate-500 text-xs">x</span>
                                <input 
                                  type="number" 
                                  placeholder="B" 
                                  className="w-10 p-1 text-center bg-slate-800 text-xs border border-slate-600 text-white rounded font-bold" 
                                  value={guesses[match.id]?.guess_penalties_b ?? ''} 
                                  onChange={(e) => handleInputChange(match.id, 'guess_penalties_b', e.target.value)}
                                  disabled={match.status === 'FINISHED'}
                                />
                              </div>
                            )}
                          </div>

                          {/* Botão lateral de Ação */}
                          <div className="min-w-[90px] text-center sm:text-right flex-shrink-0">
                            {match.status === 'FINISHED' ? (
                              <span className="text-xs bg-red-900/40 text-red-400 border border-red-800 px-2 py-1 rounded block font-bold whitespace-nowrap">Encerrada</span>
                            ) : (
                              <button onClick={() => handleSaveGuess(match.id)} className="w-full px-4 py-2 bg-slate-700 hover:bg-yellow-500 hover:text-slate-900 text-yellow-400 text-sm font-bold rounded transition cursor-pointer whitespace-nowrap">Salvar</button>
                            )}
                          </div>
                        </div>

                        {/* EXIBIÇÃO COESA DE PLACAR OFICIAL + PONTOS GANHOS */}
                        {match.status === 'FINISHED' && (
                          <div className="flex flex-wrap items-center justify-center gap-2 mt-1 border-t border-slate-700/60 pt-3 w-full">
                            <div className="bg-green-950/40 border border-green-800 text-green-400 text-xs font-bold px-3 py-1 rounded flex items-center gap-1.5 shadow-inner">
                              <span>⚽ Placar Oficial:</span>
                              <span className="text-sm text-white bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                                {match.goals_a} x {match.goals_b}
                                {match.penalties_a !== null && match.penalties_b !== null && ` (${match.penalties_a} x ${match.penalties_b} nos Pên.)`}
                              </span>
                            </div>
                            <div className={`text-xs font-bold px-3 py-1 rounded border shadow-inner ${
                              (match.points_earned ?? 0) === 25 || (match.points_earned ?? 0) === 30
                                ? 'bg-green-950/40 border-green-800 text-green-400' 
                                : (match.points_earned ?? 0) === 10 || (match.points_earned ?? 0) === 15
                                ? 'bg-blue-950/40 border-blue-800 text-blue-400'  
                                : 'bg-red-950/40 border-red-800 text-red-400'      
                            }`}>
                              🎯 Ganhou: <span className="text-sm text-white font-black">{match.points_earned ?? 0}</span> pts
                            </div>
                          </div>
                        )}

                      </div>
                    ))
                  )}
                </div>
              ) : (
                /* PAINEL DO ADMIN */
                <div className="space-y-8 w-full">
                  <div className="bg-slate-800 p-6 rounded-lg shadow-xl border border-red-950 space-y-4 w-full">
                    <h2 className="text-2xl font-bold text-red-400 border-b border-slate-700 pb-2">Cadastrar partida</h2>
                    <form onSubmit={handleCreateMatch} className="space-y-4">
                      <datalist id="teams-list">
                        {teamsList.map(team => <option key={team.id} value={team.name} />)}
                      </datalist>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1 text-slate-300">Seleção A</label>
                          <input type="text" list="teams-list" placeholder="Escolha o país..." className="w-full p-2.5 rounded bg-slate-700 border border-slate-600 text-white" value={teamAName} onChange={(e) => setTeamAName(e.target.value)} required />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1 text-slate-300">Seleção B</label>
                          <input type="text" list="teams-list" placeholder="Escolha o país..." className="w-full p-2.5 rounded bg-slate-700 border border-slate-600 text-white" value={teamBName} onChange={(e) => setTeamBName(e.target.value)} required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-slate-300">Data e hora</label>
                        <input 
                          type="datetime-local" 
                          className="w-full p-2.5 rounded bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-yellow-400 [color-scheme:dark]" 
                          value={matchDate} 
                          onChange={(e) => setMatchDate(e.target.value)} 
                          required 
                        />
                      </div>
                      
                      {/* Checkbox de Ativação do Modo Mata-Mata */}
                      <div className="flex items-center gap-2 py-2">
                        <input 
                          type="checkbox" 
                          id="knockout" 
                          className="w-4 h-4 accent-red-600" 
                          checked={isKnockout} 
                          onChange={(e) => setIsKnockout(e.target.checked)} 
                        />
                        <label htmlFor="knockout" className="text-sm font-medium text-slate-300 cursor-pointer select-none">Esta partida é de Mata-Mata (Permite disputa por pênaltis)</label>
                      </div>

                      <button type="submit" className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded shadow-lg transition cursor-pointer">Inserir Partida no Banco</button>
                    </form>
                  </div>

                  <div className="bg-slate-800 p-6 rounded-lg shadow-xl border border-slate-700 space-y-4 w-full">
                    <h2 className="text-2xl font-bold text-yellow-400 border-b border-slate-700 pb-2">Gerenciar partidas</h2>
                    {matches.length === 0 ? (
                      <p className="text-slate-500 italic">Nenhuma partida.</p>
                    ) : (
                      <div className="space-y-3">
                        {matches.map((match) => (
                          <div key={match.id} className="p-4 bg-slate-900/60 rounded border border-slate-700 flex flex-col items-center justify-between gap-4 w-full">
                            <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-4">
                              
                              <div className="flex items-center gap-2 flex-1 justify-center sm:justify-start">
                                <img src={match.team_a_flag} className="w-5 h-3.5 object-cover rounded" alt="" />
                                <span className="font-semibold text-sm">{match.team_a_name}</span>
                                <span className="text-slate-500 text-xs mx-1">x</span>
                                <img src={match.team_b_flag} className="w-5 h-3.5 object-cover rounded" alt="" />
                                <span className="font-semibold text-sm">{match.team_b_name}</span>
                                {match.is_knockout && <span className="ml-2 text-[9px] font-black bg-red-950 text-red-400 border border-red-900 px-1 rounded uppercase">Mata-Mata</span>}
                              </div>

                              {/* Form de Inputs de Encerramento */}
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <div className="flex items-center gap-1">
                                  <input type="number" placeholder="Placar A" className="w-14 p-1 bg-slate-800 text-center rounded border border-slate-600 font-bold text-yellow-400" value={adminScores[match.id]?.goals_a ?? ''} onChange={(e) => handleAdminScoreChange(match.id, 'goals_a', e.target.value)} disabled={match.status === 'FINISHED'} />
                                  <span className="text-slate-600 text-xs">x</span>
                                  <input type="number" placeholder="Placar B" className="w-14 p-1 bg-slate-800 text-center rounded border border-slate-600 font-bold text-yellow-400" value={adminScores[match.id]?.goals_b ?? ''} onChange={(e) => handleAdminScoreChange(match.id, 'goals_b', e.target.value)} disabled={match.status === 'FINISHED'} />
                                </div>

                                {/* Inputs de Pênalti do Admin se o placar digitado empatar em jogo mata-mata */}
                                {match.is_knockout && adminScores[match.id]?.goals_a === adminScores[match.id]?.goals_b && adminScores[match.id]?.goals_a !== '' && adminScores[match.id]?.goals_a !== undefined && (
                                  <div className="flex items-center gap-1 ml-2 bg-slate-950 p-1 rounded border border-red-900">
                                    <span className="text-[10px] text-red-400 font-bold uppercase px-1">Pênaltis:</span>
                                    <input type="number" placeholder="A" className="w-10 p-1 text-xs bg-slate-800 text-center rounded border border-slate-600 text-yellow-400 font-bold" value={adminScores[match.id]?.penalties_a ?? ''} onChange={(e) => handleAdminScoreChange(match.id, 'penalties_a', e.target.value)} disabled={match.status === 'FINISHED'} />
                                    <span className="text-slate-600 text-xs">x</span>
                                    <input type="number" placeholder="B" className="w-10 p-1 text-xs bg-slate-800 text-center rounded border border-slate-600 text-yellow-400 font-bold" value={adminScores[match.id]?.penalties_b ?? ''} onChange={(e) => handleAdminScoreChange(match.id, 'penalties_b', e.target.value)} disabled={match.status === 'FINISHED'} />
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 justify-end min-w-[120px]">
                                {match.status === 'FINISHED' ? (
                                  <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-1 rounded font-bold">Encerrado</span>
                                ) : (
                                  <button onClick={() => handleFinishMatch(match)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded transition cursor-pointer">Finalizar</button>
                                )}
                                <button onClick={() => handleDeleteMatch(match.id, match.team_a_name, match.team_b_name)} className="p-1.5 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white text-xs font-bold rounded border border-slate-700 hover:border-red-500 transition cursor-pointer">🗑️</button>
                              </div>

                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

export default App;