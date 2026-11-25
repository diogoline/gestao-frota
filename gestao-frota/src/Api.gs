/**
 * Api.gs
 * Ponto de entrada do app web.
 * - doGet: entrega a tela (Index.html).
 * - api: única função chamada pela tela. Confere a sessão e a permissão antes de qualquer ação.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.NOME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Permite incluir um arquivo HTML dentro de outro: <?!= incluir('Styles') ?> */
function incluir(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

/**
 * Função única chamada pela tela.
 * Sempre retorna { ok: true, dados } ou { ok: false, erro }.
 * Erros viram mensagem em vez de exceção, para a tela tratar de forma simples.
 */
function api(token, acao, payload) {
  try {
    payload = payload || {};
    if (acao === 'login') return { ok: true, dados: auth_login(payload.email, payload.senha) };
    if (acao === 'logout') return { ok: true, dados: auth_logout(token) };

    var usuario = auth_usuarioDaSessao(token);
    var fn = ACOES[acao];
    if (!fn) throw new Error('Ação desconhecida: ' + acao);
    return { ok: true, dados: fn(usuario, payload) };
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    if (msg !== 'SESSAO_EXPIRADA') console.error('api(' + acao + '): ' + msg);
    return { ok: false, erro: msg };
  }
}

// Tabelas que podem ser manipuladas pelas ações genéricas
var TABELAS_GENERICAS = ['veiculos', 'motoristas', 'leituras_km'];

function exigirTabelaGenerica_(t) {
  if (TABELAS_GENERICAS.indexOf(t) < 0) throw new Error('Tabela não permitida: ' + t);
}

var ACOES = {
  sessao: function (u) {
    return { usuario: auth_resumoUsuario_(u), listas: LISTAS };
  },

  // ---------- CRUD genérico ----------
  listar: function (u, p) {
    exigirTabelaGenerica_(p.tabela);
    auth_exigir(u, p.tabela, 'ler');
    return db_listar(p.tabela, { filtro: p.filtro });
  },
  buscar: function (u, p) {
    exigirTabelaGenerica_(p.tabela);
    auth_exigir(u, p.tabela, 'ler');
    return db_buscar(p.tabela, p.id);
  },
  salvar: function (u, p) {
    exigirTabelaGenerica_(p.tabela);
    var dados = validar_(p.tabela, p.dados || {});
    if (p.id) {
      auth_exigir(u, p.tabela, 'editar');
      // depois do cadastro, o km só muda pela ação registrarKm (mantém o histórico)
      if (p.tabela === 'veiculos') delete dados.km_atual;
      return db_atualizar(p.tabela, p.id, dados, u.email);
    }
    auth_exigir(u, p.tabela, 'criar');
    var novo = db_inserir(p.tabela, dados, u.email);
    posCriacao_(p.tabela, novo, u);
    return novo;
  },
  excluir: function (u, p) {
    exigirTabelaGenerica_(p.tabela);
    auth_exigir(u, p.tabela, 'excluir');
    return db_excluir(p.tabela, p.id, u.email);
  },

  // ---------- Km ----------
  registrarKm: function (u, p) {
    auth_exigir(u, 'leituras_km', 'criar');
    return km_registrar(p, u);
  },

  // ---------- Arquivos ----------
  enviarArquivo: function (u, p) {
    auth_exigir(u, 'arquivos', 'criar');
    return arq_salvar(p, u);
  },
  listarArquivos: function (u, p) {
    auth_exigir(u, 'arquivos', 'ler');
    return db_listar('arquivos', { filtro: { entidade: p.entidade, entidade_id: p.entidade_id } });
  },
  verArquivo: function (u, p) {
    auth_exigir(u, 'arquivos', 'ler');
    return arq_conteudo(p.id);
  },
  excluirArquivo: function (u, p) {
    auth_exigir(u, 'arquivos', 'excluir');
    return db_excluir('arquivos', p.id, u.email);
  },

  // ---------- Usuários (somente administrador) ----------
  listarUsuarios: function (u) {
    auth_exigir(u, 'usuarios', 'ler');
    return db_listar('usuarios').map(function (x) { return db_publico('usuarios', x); });
  },
  salvarUsuario: function (u, p) {
    var d = p.dados || {};
    if (p.id) {
      auth_exigir(u, 'usuarios', 'editar');
      if (p.id === u.id && d.perfil && d.perfil !== u.perfil) throw new Error('Você não pode alterar o seu próprio perfil.');
      if (d.perfil && LISTAS.perfil.indexOf(d.perfil) < 0) throw new Error('Perfil inválido.');
      var r = db_atualizar('usuarios', p.id, { nome: d.nome, email: String(d.email || '').toLowerCase(), perfil: d.perfil }, u.email);
      if (p.senha) auth_definirSenha(p.id, p.senha, u.email);
      return db_publico('usuarios', r);
    }
    auth_exigir(u, 'usuarios', 'criar');
    return db_publico('usuarios', auth_criarUsuario(d, p.senha, u.email));
  },
  excluirUsuario: function (u, p) {
    auth_exigir(u, 'usuarios', 'excluir');
    if (p.id === u.id) throw new Error('Você não pode excluir o seu próprio usuário.');
    return db_excluir('usuarios', p.id, u.email);
  },

  // ---------- Preferências do próprio usuário ----------
  salvarTema: function (u, p) {
    if (APP.TEMAS.indexOf(p.tema) < 0) throw new Error('Tema inválido.');
    db_atualizar('usuarios', u.id, { tema: p.tema }, u.email);
    return true;
  },
  trocarSenha: function (u, p) {
    var conf = auth_hash_(p.senhaAtual || '', u.senha_salt);
    if (!auth_iguais_(conf, u.senha_hash)) throw new Error('Senha atual incorreta.');
    return auth_definirSenha(u.id, p.novaSenha, u.email);
  }
};
