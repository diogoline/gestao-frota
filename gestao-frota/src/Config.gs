/**
 * Config.gs
 * Definição central do "banco de dados": cada aba da planilha é uma tabela.
 * Para adicionar uma coluna nova, inclua aqui e rode "Instalar / atualizar estrutura"
 * no menu da planilha. Colunas existentes nunca são apagadas.
 */

var APP = {
  NOME: 'Gestão de Frota',
  PASTA_RAIZ: 'Gestão de Frota - Arquivos',
  SESSAO_SEGUNDOS: 6 * 60 * 60,      // 6 horas (limite máximo do CacheService)
  LOGIN_MAX_TENTATIVAS: 5,            // por e-mail, a cada 15 minutos
  HASH_ITERACOES: 2000,
  TEMAS: ['claro', 'escuro', 'frota']
};

// Colunas de auditoria adicionadas a todas as tabelas de negócio
var AUDITORIA = ['ativo', 'criado_em', 'criado_por', 'atualizado_em', 'atualizado_por'];

/**
 * Esquema das tabelas.
 * cols: colunas na ordem em que aparecem na aba (o "id" é sempre a primeira).
 * unicos: colunas que não podem se repetir entre registros ativos.
 * obrigatorios: colunas que precisam ser preenchidas.
 * auditoria: se true, recebe as colunas de AUDITORIA no final.
 */
var SCHEMA = {
  usuarios: {
    cols: ['id', 'nome', 'email', 'perfil', 'senha_hash', 'senha_salt', 'tema', 'ultimo_acesso'],
    unicos: ['email'],
    obrigatorios: ['nome', 'email', 'perfil'],
    auditoria: true,
    privadas: ['senha_hash', 'senha_salt'] // nunca enviadas para a tela
  },
  veiculos: {
    cols: ['id', 'placa', 'renavam', 'chassi', 'marca', 'modelo', 'versao',
      'ano_fabricacao', 'ano_modelo', 'cor', 'combustivel', 'codigo_fipe',
      'km_atual', 'data_aquisicao', 'valor_aquisicao', 'status', 'foto_id', 'observacoes'],
    unicos: ['placa', 'renavam', 'chassi'],
    obrigatorios: ['placa', 'marca', 'modelo', 'status'],
    auditoria: true
  },
  motoristas: {
    cols: ['id', 'nome', 'cpf', 'rg', 'data_nascimento', 'telefone', 'email',
      'cep', 'endereco', 'cidade', 'uf', 'cnh_numero', 'cnh_categoria', 'cnh_validade',
      'plataforma', 'status', 'foto_id', 'observacoes'],
    unicos: ['cpf', 'cnh_numero'],
    obrigatorios: ['nome', 'cpf', 'telefone', 'cnh_numero', 'cnh_validade', 'status'],
    auditoria: true
  },
  leituras_km: {
    cols: ['id', 'veiculo_id', 'data', 'km', 'origem', 'observacao'],
    unicos: [],
    obrigatorios: ['veiculo_id', 'data', 'km', 'origem'],
    auditoria: true
  },
  arquivos: {
    cols: ['id', 'entidade', 'entidade_id', 'tipo', 'drive_id', 'nome', 'mime'],
    unicos: [],
    obrigatorios: ['entidade', 'entidade_id', 'tipo', 'drive_id'],
    auditoria: true
  },
  log: {
    cols: ['id', 'data_hora', 'usuario', 'acao', 'tabela', 'registro_id', 'detalhe'],
    unicos: [],
    obrigatorios: [],
    auditoria: false
  }
};

// Listas fixas usadas em validação e nos campos de seleção da tela
var LISTAS = {
  perfil: ['administrador', 'operador'],
  status_veiculo: ['disponivel', 'locado', 'manutencao', 'inativo'],
  status_motorista: ['ativo', 'bloqueado', 'inativo'],
  combustivel: ['flex', 'gasolina', 'etanol', 'diesel', 'gnv', 'eletrico', 'hibrido'],
  origem_km: ['cadastro', 'entrega', 'devolucao', 'manutencao', 'motorista', 'ajuste'],
  cnh_categoria: ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'],
  plataforma: ['uber', '99', 'indrive', 'outra', 'nenhuma'],
  tipo_arquivo: ['foto_veiculo', 'foto_motorista', 'cnh', 'comprovante_residencia', 'documento_veiculo', 'outro']
};

/**
 * Permissões por perfil.
 * Formato: 'tabela': ['ler', 'criar', 'editar', 'excluir']
 */
var PERMISSOES = {
  administrador: {
    usuarios: ['ler', 'criar', 'editar', 'excluir'],
    veiculos: ['ler', 'criar', 'editar', 'excluir'],
    motoristas: ['ler', 'criar', 'editar', 'excluir'],
    leituras_km: ['ler', 'criar', 'editar', 'excluir'],
    arquivos: ['ler', 'criar', 'excluir'],
    log: ['ler']
  },
  operador: {
    veiculos: ['ler', 'criar', 'editar'],
    motoristas: ['ler', 'criar', 'editar'],
    leituras_km: ['ler', 'criar'],
    arquivos: ['ler', 'criar']
  }
};

function colunasDe(tabela) {
  var def = SCHEMA[tabela];
  if (!def) throw new Error('Tabela desconhecida: ' + tabela);
  return def.auditoria ? def.cols.concat(AUDITORIA) : def.cols.slice();
}
