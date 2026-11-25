/**
 * Db.gs
 * Camada de acesso aos dados. Toda leitura e gravação na planilha passa por aqui.
 *
 * Regras importantes:
 * - Cada registro tem um "id" único (UUID), nunca reaproveitado.
 * - Nada é apagado de verdade: "excluir" marca ativo = FALSE (exclusão lógica),
 *   preservando o histórico.
 * - Gravações usam LockService para evitar que dois usuários escrevam ao mesmo tempo
 *   e um sobrescreva o outro.
 * - Todos os valores são gravados como texto (formato "@" na aba). Datas vão no formato
 *   AAAA-MM-DD. Isso evita o Sheets converter datas e números sozinho.
 */

function db_aba_(tabela) {
  var aba = SpreadsheetApp.getActive().getSheetByName(tabela);
  if (!aba) throw new Error('Aba "' + tabela + '" não encontrada. Rode "Instalar / atualizar estrutura" no menu da planilha.');
  return aba;
}

/** Lê o cabeçalho real da aba (permite colunas reordenadas manualmente). */
function db_cabecalho_(aba) {
  var ultimaCol = aba.getLastColumn();
  if (ultimaCol === 0) return [];
  return aba.getRange(1, 1, 1, ultimaCol).getValues()[0].map(String);
}

/** Converte uma linha da planilha em objeto { coluna: valor }. */
function db_linhaParaObjeto_(cab, linha) {
  var obj = {};
  for (var i = 0; i < cab.length; i++) {
    if (!cab[i]) continue;
    var v = linha[i];
    // Se alguém digitar direto na planilha, o Sheets pode converter para data/booleano.
    if (v instanceof Date) v = Utilities.formatDate(v, APP_TZ_(), 'yyyy-MM-dd');
    else if (v === true) v = 'TRUE';
    else if (v === false) v = 'FALSE';
    obj[cab[i]] = v === null || v === undefined ? '' : String(v);
  }
  return obj;
}

/**
 * Lista registros de uma tabela.
 * opcoes.incluirInativos: inclui registros excluídos (ativo = FALSE).
 * opcoes.filtro: objeto { coluna: valor } com igualdade exata.
 */
function db_listar(tabela, opcoes) {
  opcoes = opcoes || {};
  var aba = db_aba_(tabela);
  var cab = db_cabecalho_(aba);
  var n = aba.getLastRow() - 1;
  if (n < 1) return [];
  var dados = aba.getRange(2, 1, n, cab.length).getValues();
  var temAtivo = cab.indexOf('ativo') >= 0;
  var resultado = [];
  for (var i = 0; i < dados.length; i++) {
    var obj = db_linhaParaObjeto_(cab, dados[i]);
    if (!obj.id) continue;
    if (temAtivo && !opcoes.incluirInativos && obj.ativo !== 'TRUE') continue;
    if (opcoes.filtro) {
      var ok = true;
      for (var k in opcoes.filtro) if (obj[k] !== String(opcoes.filtro[k])) { ok = false; break; }
      if (!ok) continue;
    }
    resultado.push(obj);
  }
  return resultado;
}

function db_buscar(tabela, id) {
  var lista = db_listar(tabela, { incluirInativos: true, filtro: { id: id } });
  return lista.length ? lista[0] : null;
}

/** Localiza o número da linha (1-based) de um id. */
function db_linhaDoId_(aba, cab, id) {
  var col = cab.indexOf('id') + 1;
  var n = aba.getLastRow() - 1;
  if (n < 1) return -1;
  var ids = aba.getRange(2, col, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function db_agora_() {
  return Utilities.formatDate(new Date(), APP_TZ_(), "yyyy-MM-dd'T'HH:mm:ss");
}

function APP_TZ_() {
  return Session.getScriptTimeZone() || 'America/Sao_Paulo';
}

/** Valida obrigatórios e únicos. Lança erro com mensagem amigável. */
function db_validar_(tabela, registro, idAtual) {
  var def = SCHEMA[tabela];
  (def.obrigatorios || []).forEach(function (c) {
    if (registro[c] === undefined || String(registro[c]).trim() === '') {
      throw new Error('Campo obrigatório não preenchido: ' + c.replace(/_/g, ' '));
    }
  });
  if (def.unicos && def.unicos.length) {
    var existentes = db_listar(tabela);
    def.unicos.forEach(function (c) {
      var v = String(registro[c] || '').trim().toUpperCase();
      if (!v) return;
      existentes.forEach(function (e) {
        if (e.id !== idAtual && String(e[c] || '').trim().toUpperCase() === v) {
          throw new Error('Já existe outro cadastro com o mesmo valor em "' + c.replace(/_/g, ' ') + '": ' + registro[c]);
        }
      });
    });
  }
}

/** Remove colunas que não existem no esquema e as colunas controladas pelo sistema. */
function db_limpar_(tabela, dados) {
  var permitidas = SCHEMA[tabela].cols;
  var limpo = {};
  permitidas.forEach(function (c) {
    if (c === 'id') return;
    if (dados[c] !== undefined && dados[c] !== null) limpo[c] = String(dados[c]).trim();
  });
  return limpo;
}

function db_comTrava_(fn) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) throw new Error('O sistema está ocupado com outra gravação. Tente novamente em alguns segundos.');
  try {
    return fn();
  } finally {
    trava.releaseLock();
  }
}

/** Grava uma linha nova garantindo formato texto (evita conversão automática do Sheets). */
function db_novaLinha_(aba, linha) {
  var n = aba.getLastRow() + 1;
  if (n > aba.getMaxRows()) aba.insertRowsAfter(aba.getMaxRows(), 100);
  var faixa = aba.getRange(n, 1, 1, linha.length);
  faixa.setNumberFormat('@');
  faixa.setValues([linha]);
}

/** Insere um registro. Retorna o registro completo gravado. */
function db_inserir(tabela, dados, usuarioEmail) {
  return db_comTrava_(function () {
    var registro = db_limpar_(tabela, dados);
    db_validar_(tabela, registro, null);
    var aba = db_aba_(tabela);
    var cab = db_cabecalho_(aba);
    registro.id = Utilities.getUuid();
    if (SCHEMA[tabela].auditoria) {
      var agora = db_agora_();
      registro.ativo = 'TRUE';
      registro.criado_em = agora;
      registro.criado_por = usuarioEmail || '';
      registro.atualizado_em = agora;
      registro.atualizado_por = usuarioEmail || '';
    }
    var linha = cab.map(function (c) { return registro[c] !== undefined ? registro[c] : ''; });
    db_novaLinha_(aba, linha);
    if (tabela !== 'log') db_log_(usuarioEmail, 'criar', tabela, registro.id, '');
    return registro;
  });
}

/** Atualiza campos de um registro existente. Só grava as colunas enviadas. */
function db_atualizar(tabela, id, dados, usuarioEmail) {
  return db_comTrava_(function () {
    var aba = db_aba_(tabela);
    var cab = db_cabecalho_(aba);
    var linhaN = db_linhaDoId_(aba, cab, id);
    if (linhaN < 0) throw new Error('Registro não encontrado.');
    var atual = db_linhaParaObjeto_(cab, aba.getRange(linhaN, 1, 1, cab.length).getValues()[0]);
    var mudancas = db_limpar_(tabela, dados);
    var novo = {};
    for (var k in atual) novo[k] = atual[k];
    for (var m in mudancas) novo[m] = mudancas[m];
    db_validar_(tabela, novo, id);
    if (SCHEMA[tabela].auditoria) {
      novo.atualizado_em = db_agora_();
      novo.atualizado_por = usuarioEmail || '';
    }
    var linha = cab.map(function (c) { return novo[c] !== undefined ? novo[c] : ''; });
    aba.getRange(linhaN, 1, 1, cab.length).setValues([linha]);
    var alterados = Object.keys(mudancas).filter(function (k) { return atual[k] !== mudancas[k]; });
    db_log_(usuarioEmail, 'editar', tabela, id, alterados.join(', '));
    return novo;
  });
}

/** Exclusão lógica: marca ativo = FALSE. */
function db_excluir(tabela, id, usuarioEmail) {
  return db_comTrava_(function () {
    var aba = db_aba_(tabela);
    var cab = db_cabecalho_(aba);
    var linhaN = db_linhaDoId_(aba, cab, id);
    if (linhaN < 0) throw new Error('Registro não encontrado.');
    var colAtivo = cab.indexOf('ativo') + 1;
    if (colAtivo < 1) throw new Error('Esta tabela não permite exclusão.');
    aba.getRange(linhaN, colAtivo).setValue('FALSE');
    var colAt = cab.indexOf('atualizado_em') + 1;
    var colPor = cab.indexOf('atualizado_por') + 1;
    if (colAt) aba.getRange(linhaN, colAt).setValue(db_agora_());
    if (colPor) aba.getRange(linhaN, colPor).setValue(usuarioEmail || '');
    db_log_(usuarioEmail, 'excluir', tabela, id, '');
    return true;
  });
}

/** Registro de auditoria. Grava direto (já estamos dentro da trava). */
function db_log_(usuario, acao, tabela, registroId, detalhe) {
  try {
    var aba = SpreadsheetApp.getActive().getSheetByName('log');
    if (!aba) return;
    db_novaLinha_(aba, [Utilities.getUuid(), db_agora_(), usuario || '', acao, tabela, registroId || '', detalhe || '']);
  } catch (e) {
    console.error('Falha ao gravar log: ' + e);
  }
}

/** Remove colunas privadas (ex.: senha) antes de enviar à tela. */
function db_publico(tabela, registro) {
  if (!registro) return registro;
  var privadas = SCHEMA[tabela].privadas || [];
  var copia = {};
  for (var k in registro) if (privadas.indexOf(k) < 0) copia[k] = registro[k];
  return copia;
}
