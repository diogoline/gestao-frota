/**
 * Setup.gs
 * Menu da planilha e instalação da estrutura.
 * "Instalar / atualizar estrutura" pode ser rodado quantas vezes quiser:
 * cria abas e colunas que faltam e nunca apaga dados.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Gestão de Frota')
    .addItem('Instalar / atualizar estrutura', 'instalar')
    .addItem('Criar usuário administrador', 'criarAdministradorPeloMenu')
    .addSeparator()
    .addItem('Mostrar link do sistema', 'mostrarLink')
    .addToUi();
}

function instalar() {
  var ss = SpreadsheetApp.getActive();
  var relatorio = [];

  Object.keys(SCHEMA).forEach(function (tabela) {
    var cols = colunasDe(tabela);
    var aba = ss.getSheetByName(tabela);
    if (!aba) {
      aba = ss.insertSheet(tabela);
      relatorio.push('Aba criada: ' + tabela);
    }
    var atuais = aba.getLastColumn() > 0
      ? aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String)
      : [];
    var faltando = cols.filter(function (c) { return atuais.indexOf(c) < 0; });
    if (faltando.length) {
      var inicio = atuais.filter(String).length + 1;
      aba.getRange(1, inicio, 1, faltando.length).setValues([faltando]);
      relatorio.push(tabela + ': colunas adicionadas: ' + faltando.join(', '));
    }
    var total = aba.getLastColumn();
    // Tudo como texto: evita o Sheets converter datas, CPFs e placas sozinho
    aba.getRange(1, 1, aba.getMaxRows(), total).setNumberFormat('@');
    aba.getRange(1, 1, 1, total).setFontWeight('bold').setBackground('#e8eef5');
    aba.setFrozenRows(1);
  });

  // Remove a aba padrão vazia, se existir
  ['Página1', 'Sheet1', 'Planilha1'].forEach(function (n) {
    var a = ss.getSheetByName(n);
    if (a && a.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(a);
  });

  arq_pastaRaiz_();
  relatorio.push('Pasta de arquivos no Drive: ' + APP.PASTA_RAIZ);

  var ui = SpreadsheetApp.getUi();
  ui.alert('Instalação concluída', relatorio.join('\n') || 'Estrutura já estava atualizada.', ui.ButtonSet.OK);
}

function criarAdministradorPeloMenu() {
  var ui = SpreadsheetApp.getUi();
  var nome = ui.prompt('Novo administrador', 'Nome completo:', ui.ButtonSet.OK_CANCEL);
  if (nome.getSelectedButton() !== ui.Button.OK) return;
  var email = ui.prompt('Novo administrador', 'E-mail (será o login):', ui.ButtonSet.OK_CANCEL);
  if (email.getSelectedButton() !== ui.Button.OK) return;
  var senha = ui.prompt('Novo administrador',
    'Senha (mínimo 8 caracteres, com letras e números).\nAtenção: o campo não esconde a senha.', ui.ButtonSet.OK_CANCEL);
  if (senha.getSelectedButton() !== ui.Button.OK) return;
  try {
    auth_criarUsuario({ nome: nome.getResponseText(), email: email.getResponseText(), perfil: 'administrador' },
      senha.getResponseText(), 'instalacao');
    ui.alert('Administrador criado. Use "Mostrar link do sistema" para acessar.');
  } catch (e) {
    ui.alert('Erro: ' + e.message);
  }
}

function mostrarLink() {
  var ui = SpreadsheetApp.getUi();
  var url = ScriptApp.getService().getUrl();
  if (!url) {
    ui.alert('O sistema ainda não foi publicado.\nNo editor do Apps Script: Implantar > Nova implantação > App da Web.');
    return;
  }
  ui.alert('Link do sistema', url, ui.ButtonSet.OK);
}
