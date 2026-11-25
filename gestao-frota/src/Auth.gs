/**
 * Auth.gs
 * Login próprio com e-mail e senha.
 *
 * Por que não usar o login do Google direto?
 * Em contas Gmail comuns, um app web que roda "como o dono" não consegue saber o e-mail
 * de quem está acessando. A alternativa seria compartilhar a planilha com cada usuário,
 * o que permitiria a qualquer um abrir a planilha e ver/alterar tudo, ignorando as
 * permissões. Com login próprio, a planilha fica só com o dono.
 *
 * Senhas: nunca são guardadas. Guardamos um "hash" (impressão digital irreversível)
 * calculado com um "salt" (valor aleatório por usuário).
 * Sessões: ao logar, o usuário recebe um token aleatório guardado no CacheService por 6h.
 */

function auth_hash_(senha, salt) {
  var valor = salt + '|' + senha;
  for (var i = 0; i < APP.HASH_ITERACOES; i++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, valor, Utilities.Charset.UTF_8);
    valor = Utilities.base64Encode(bytes) + salt;
  }
  return valor;
}

function auth_novoSalt_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function auth_validarSenhaForte_(senha) {
  if (!senha || senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) throw new Error('A senha precisa ter letras e números.');
}

/** Compara strings em tempo constante (evita ataques por tempo de resposta). */
function auth_iguais_(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function auth_login(email, senha) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !senha) throw new Error('Informe e-mail e senha.');

  var cache = CacheService.getScriptCache();
  var chaveTent = 'tent_' + email;
  var tentativas = Number(cache.get(chaveTent) || 0);
  if (tentativas >= APP.LOGIN_MAX_TENTATIVAS) {
    throw new Error('Muitas tentativas. Aguarde 15 minutos e tente novamente.');
  }

  var usuario = db_listar('usuarios').filter(function (u) { return u.email.toLowerCase() === email; })[0];
  var ok = usuario && usuario.senha_salt && auth_iguais_(auth_hash_(senha, usuario.senha_salt), usuario.senha_hash);
  if (!ok) {
    cache.put(chaveTent, String(tentativas + 1), 15 * 60);
    throw new Error('E-mail ou senha incorretos.');
  }
  cache.remove(chaveTent);

  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('sessao_' + token, usuario.id, APP.SESSAO_SEGUNDOS);
  try {
    db_atualizar('usuarios', usuario.id, { ultimo_acesso: db_agora_() }, usuario.email);
  } catch (e) { /* não impede o login */ }

  return { token: token, usuario: auth_resumoUsuario_(usuario) };
}

function auth_logout(token) {
  if (token) CacheService.getScriptCache().remove('sessao_' + token);
  return true;
}

/** Retorna o usuário da sessão ou lança erro "SESSAO_EXPIRADA". */
function auth_usuarioDaSessao(token) {
  if (!token) throw new Error('SESSAO_EXPIRADA');
  var cache = CacheService.getScriptCache();
  var id = cache.get('sessao_' + token);
  if (!id) throw new Error('SESSAO_EXPIRADA');
  var usuario = db_buscar('usuarios', id);
  if (!usuario || usuario.ativo !== 'TRUE') throw new Error('SESSAO_EXPIRADA');
  // renova a sessão a cada uso
  cache.put('sessao_' + token, id, APP.SESSAO_SEGUNDOS);
  return usuario;
}

function auth_resumoUsuario_(u) {
  return {
    id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, tema: u.tema || 'claro',
    permissoes: PERMISSOES[u.perfil] || {}
  };
}

function auth_pode(usuario, tabela, acao) {
  var p = PERMISSOES[usuario.perfil] || {};
  return (p[tabela] || []).indexOf(acao) >= 0;
}

function auth_exigir(usuario, tabela, acao) {
  if (!auth_pode(usuario, tabela, acao)) {
    throw new Error('Você não tem permissão para esta ação (' + acao + ' ' + tabela + ').');
  }
}

/** Cria um usuário com senha (usado pelo admin e pela instalação). */
function auth_criarUsuario(dados, senha, criadoPor) {
  auth_validarSenhaForte_(senha);
  if (LISTAS.perfil.indexOf(dados.perfil) < 0) throw new Error('Perfil inválido.');
  var salt = auth_novoSalt_();
  var registro = {
    nome: dados.nome,
    email: String(dados.email || '').trim().toLowerCase(),
    perfil: dados.perfil,
    tema: dados.tema || 'claro',
    senha_salt: salt,
    senha_hash: auth_hash_(senha, salt)
  };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(registro.email)) throw new Error('E-mail inválido.');
  return db_inserir('usuarios', registro, criadoPor);
}

function auth_definirSenha(usuarioId, senha, alteradoPor) {
  auth_validarSenhaForte_(senha);
  var salt = auth_novoSalt_();
  db_atualizar('usuarios', usuarioId, { senha_salt: salt, senha_hash: auth_hash_(senha, salt) }, alteradoPor);
  return true;
}
