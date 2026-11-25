/**
 * Arquivos.gs
 * Fotos e documentos ficam no Google Drive do dono da planilha, em pastas privadas:
 *   Gestão de Frota - Arquivos / veiculos / <id do veículo> / ...
 * A tela nunca acessa o Drive direto: pede o arquivo para o servidor, que confere a permissão.
 */

var ARQ_MAX_BYTES = 5 * 1024 * 1024; // 5 MB por arquivo (a tela já reduz as fotos antes de enviar)
var ARQ_TIPOS_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
var ARQ_ENTIDADES = ['veiculos', 'motoristas'];

function arq_pastaRaiz_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PASTA_RAIZ_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* pasta apagada: recria */ }
  }
  var pasta = DriveApp.createFolder(APP.PASTA_RAIZ);
  props.setProperty('PASTA_RAIZ_ID', pasta.getId());
  return pasta;
}

function arq_subpasta_(pai, nome) {
  var it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

/**
 * Salva um arquivo enviado pela tela.
 * p: { entidade, entidade_id, tipo, nome, mime, base64, definirComoFoto }
 */
function arq_salvar(p, usuario) {
  if (ARQ_ENTIDADES.indexOf(p.entidade) < 0) throw new Error('Entidade inválida.');
  if (LISTAS.tipo_arquivo.indexOf(p.tipo) < 0) throw new Error('Tipo de arquivo inválido.');
  if (ARQ_TIPOS_MIME.indexOf(p.mime) < 0) throw new Error('Formato não permitido. Use JPG, PNG, WEBP ou PDF.');
  var dono = db_buscar(p.entidade, p.entidade_id);
  if (!dono || dono.ativo !== 'TRUE') throw new Error('Registro não encontrado.');

  var bytes = Utilities.base64Decode(p.base64);
  if (bytes.length > ARQ_MAX_BYTES) throw new Error('Arquivo maior que 5 MB.');

  var nomeSeguro = String(p.nome || 'arquivo').replace(/[^\w.\- ]/g, '_').slice(0, 80);
  var blob = Utilities.newBlob(bytes, p.mime, nomeSeguro);
  var pasta = arq_subpasta_(arq_subpasta_(arq_pastaRaiz_(), p.entidade), p.entidade_id);
  var arquivo = pasta.createFile(blob);

  var reg = db_inserir('arquivos', {
    entidade: p.entidade, entidade_id: p.entidade_id, tipo: p.tipo,
    drive_id: arquivo.getId(), nome: nomeSeguro, mime: p.mime
  }, usuario.email);

  if (p.definirComoFoto) {
    db_atualizar(p.entidade, p.entidade_id, { foto_id: reg.id }, usuario.email);
  }
  return reg;
}

/** Retorna o conteúdo do arquivo como data URL para a tela exibir. */
function arq_conteudo(arquivoId) {
  var reg = db_buscar('arquivos', arquivoId);
  if (!reg || reg.ativo !== 'TRUE') throw new Error('Arquivo não encontrado.');
  var blob = DriveApp.getFileById(reg.drive_id).getBlob();
  return {
    nome: reg.nome, mime: reg.mime,
    dataUrl: 'data:' + reg.mime + ';base64,' + Utilities.base64Encode(blob.getBytes())
  };
}
