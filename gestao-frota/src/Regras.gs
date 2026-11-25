/**
 * Regras.gs
 * Validações e regras de negócio específicas de cada cadastro.
 */

function so_digitos_(v) { return String(v || '').replace(/\D/g, ''); }

function cpf_valido_(cpf) {
  cpf = so_digitos_(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (var t = 9; t < 11; t++) {
    var soma = 0;
    for (var i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
    var dig = ((soma * 10) % 11) % 10;
    if (dig !== Number(cpf[t])) return false;
  }
  return true;
}

function data_valida_(v) {
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  var d = new Date(v + 'T12:00:00');
  return !isNaN(d.getTime());
}

function exigirLista_(valor, lista, nomeCampo) {
  if (valor && LISTAS[lista].indexOf(valor) < 0) throw new Error('Valor inválido em ' + nomeCampo + ': ' + valor);
}

/** Normaliza e valida os dados antes de gravar. Retorna os dados normalizados. */
function validar_(tabela, d) {
  var x = {};
  for (var k in d) x[k] = typeof d[k] === 'string' ? d[k].trim() : d[k];

  if (tabela === 'veiculos') {
    if (x.placa !== undefined) {
      x.placa = String(x.placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
      // aceita placa antiga (ABC1234) e Mercosul (ABC1D23)
      if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(x.placa)) throw new Error('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
    }
    if (x.renavam) { x.renavam = so_digitos_(x.renavam); if (x.renavam.length < 9 || x.renavam.length > 11) throw new Error('RENAVAM inválido.'); }
    if (x.chassi) { x.chassi = String(x.chassi).toUpperCase().replace(/\s/g, ''); if (x.chassi.length !== 17) throw new Error('Chassi deve ter 17 caracteres.'); }
    ['ano_fabricacao', 'ano_modelo'].forEach(function (c) {
      if (x[c] && !/^(19|20)\d{2}$/.test(x[c])) throw new Error('Ano inválido em ' + c.replace('_', ' ') + '.');
    });
    if (x.km_atual !== undefined && x.km_atual !== '') {
      x.km_atual = so_digitos_(x.km_atual);
    }
    if (x.valor_aquisicao) {
      var v = Number(String(x.valor_aquisicao).replace(/\./g, '').replace(',', '.'));
      if (isNaN(v) || v < 0) throw new Error('Valor de aquisição inválido.');
      x.valor_aquisicao = v.toFixed(2);
    }
    if (!data_valida_(x.data_aquisicao)) throw new Error('Data de aquisição inválida.');
    exigirLista_(x.status, 'status_veiculo', 'status');
    exigirLista_(x.combustivel, 'combustivel', 'combustível');
  }

  if (tabela === 'motoristas') {
    if (x.cpf !== undefined) {
      if (!cpf_valido_(x.cpf)) throw new Error('CPF inválido.');
      x.cpf = so_digitos_(x.cpf);
    }
    if (x.telefone !== undefined) x.telefone = so_digitos_(x.telefone);
    if (x.cep !== undefined) x.cep = so_digitos_(x.cep);
    if (x.cnh_numero !== undefined) x.cnh_numero = so_digitos_(x.cnh_numero);
    if (x.email) {
      x.email = String(x.email).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)) throw new Error('E-mail inválido.');
    }
    if (x.uf) x.uf = String(x.uf).toUpperCase().slice(0, 2);
    if (!data_valida_(x.cnh_validade)) throw new Error('Validade da CNH inválida.');
    if (!data_valida_(x.data_nascimento)) throw new Error('Data de nascimento inválida.');
    exigirLista_(x.status, 'status_motorista', 'status');
    exigirLista_(x.cnh_categoria, 'cnh_categoria', 'categoria da CNH');
    exigirLista_(x.plataforma, 'plataforma', 'plataforma');
  }

  if (tabela === 'leituras_km') {
    // leituras de km passam por km_registrar, que aplica as regras
    throw new Error('Use a ação de registrar km.');
  }
  return x;
}

/** Ações automáticas após criar um registro. */
function posCriacao_(tabela, registro, usuario) {
  if (tabela === 'veiculos' && registro.km_atual) {
    db_inserir('leituras_km', {
      veiculo_id: registro.id, data: registro.criado_em.slice(0, 10),
      km: registro.km_atual, origem: 'cadastro', observacao: 'Km informado no cadastro'
    }, usuario.email);
  }
}

/**
 * Registra uma leitura de km e atualiza o km atual do veículo.
 * Km menor que o atual só é aceito com origem "ajuste" e por administrador
 * (para corrigir erro de digitação), porque hodômetro não volta.
 */
function km_registrar(p, usuario) {
  var veiculo = db_buscar('veiculos', p.veiculo_id);
  if (!veiculo || veiculo.ativo !== 'TRUE') throw new Error('Veículo não encontrado.');
  var kmTxt = so_digitos_(p.km);
  if (!kmTxt) throw new Error('Km inválido.');
  var km = Number(kmTxt);
  var data = p.data || db_agora_().slice(0, 10);
  if (!data_valida_(data)) throw new Error('Data inválida.');
  exigirLista_(p.origem, 'origem_km', 'origem');
  var atual = Number(veiculo.km_atual || 0);
  if (km < atual) {
    if (p.origem !== 'ajuste' || usuario.perfil !== 'administrador') {
      throw new Error('Km informado (' + km + ') é menor que o atual (' + atual + '). Só um administrador pode lançar ajuste.');
    }
  }
  var leitura = db_inserir('leituras_km', {
    veiculo_id: veiculo.id, data: data, km: String(km), origem: p.origem, observacao: p.observacao || ''
  }, usuario.email);
  if (km > atual || p.origem === 'ajuste') {
    db_atualizar('veiculos', veiculo.id, { km_atual: String(km) }, usuario.email);
  }
  return leitura;
}
