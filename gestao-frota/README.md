# Gestão de Frota

Sistema para controlar uma frota de veículos de locação: veículos, motoristas, manutenção, contratos, vistorias, cobranças e indicadores.

Ele roda como **App Web do Google Apps Script** e usa uma **planilha Google** como banco de dados. As fotos e os documentos ficam numa pasta privada do Google Drive.

## Situação atual (Fase 1, parte 1)

- Login com e-mail e senha, com os perfis **Administrador** e **Operador**.
- Cadastro de **veículos** com foto, documentos e histórico de km.
- Cadastro de **motoristas** com CNH, documentos e alerta de vencimento da CNH.
- Tela inicial com o resumo da frota e as CNHs vencendo.
- Gestão de usuários (somente o administrador).
- **3 temas** de cores (claro, escuro e verde frota), salvos por usuário.
- Funciona no celular e no computador.

Ainda faltam: manutenção com lembretes, contrato em PDF, vistoria, cobrança/Pix, infrações, FIPE, dashboard e e-mails. Veja o [Roteiro](#roteiro).

## Como funciona (visão geral)

```
Navegador (celular/PC)
   │  google.script.run → api(token, ação, dados)
   ▼
Apps Script (src/*.gs)  ── confere a sessão e a permissão de cada ação
   │
   ├── Planilha: cada aba é uma tabela (usuarios, veiculos, motoristas, leituras_km, arquivos, log)
   └── Drive: pasta "Gestão de Frota - Arquivos" com as fotos e os documentos
```

| Arquivo | Para que serve |
|---|---|
| `src/Config.gs` | Tabelas, colunas, listas de opções e permissões por perfil. **É o primeiro lugar para olhar.** |
| `src/Db.gs` | Lê e grava na planilha (com trava contra gravação simultânea e com exclusão lógica). |
| `src/Auth.gs` | Login, senha (guardada como hash) e sessão. |
| `src/Api.gs` | Recebe os pedidos da tela e confere as permissões. |
| `src/Regras.gs` | Validações (placa, CPF, datas) e regras de km. |
| `src/Arquivos.gs` | Envio e leitura de fotos e documentos no Drive. |
| `src/Setup.gs` | Menu da planilha e instalação da estrutura. |
| `src/Index.html`, `Styles.html`, `App.html` | A tela: estrutura, visual/temas e lógica. |
| `dev/servidor-local.js` | Simulador para testar no computador, sem Google (só para desenvolvimento). |

### Decisões importantes

- **Login próprio, em vez do login do Google:** em contas Gmail comuns, o app web não consegue saber o e-mail de quem acessa. A alternativa seria compartilhar a planilha com cada usuário, e aí qualquer um poderia abrir a planilha e passar por cima das permissões. Com o login próprio, **a planilha fica só com você**.
- **Tudo é gravado como texto** (datas no formato AAAA-MM-DD), para o Sheets não converter CPF, placa ou data sozinho.
- **Nada é apagado de verdade:** a exclusão marca `ativo = FALSE`, e toda alteração fica registrada na aba `log`.
- **O km só sobe:** km menor que o atual só entra como "Ajuste", lançado por um administrador.

## Instalação (passo a passo)

> Faça isso com a conta Google dona da planilha.

1. Abra a planilha e vá em **Extensões → Apps Script**.
2. No editor, para **cada arquivo** da pasta `src/`:
   - `.gs`: clique em **+ → Script**, dê o mesmo nome sem a extensão (por exemplo, `Config`) e cole o conteúdo. O arquivo `Código.gs` que já vem no projeto pode ser apagado.
   - `.html`: clique em **+ → HTML**, dê o mesmo nome sem a extensão (`Index`, `Styles`, `App`) e cole o conteúdo.
   - `appsscript.json`: em **Configurações do projeto (engrenagem)**, marque "Mostrar arquivo de manifesto appsscript.json no editor". Depois abra o arquivo e cole o conteúdo.
3. Salve tudo (Ctrl+S). Volte para a planilha e **recarregue a página**. Vai aparecer o menu **Gestão de Frota**.
4. Clique em **Gestão de Frota → Instalar / atualizar estrutura**. Na primeira vez, o Google pede autorização: clique em *Avançado → Acessar (não seguro)*. Isso aparece porque o script é seu e não foi verificado pelo Google.
5. Clique em **Gestão de Frota → Criar usuário administrador** e informe nome, e-mail e senha.
6. No editor do Apps Script, vá em **Implantar → Nova implantação**:
   - Tipo: **App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Clique em **Implantar** e copie o link. Ele também aparece no menu, em **Mostrar link do sistema**.
7. Abra o link e entre com o administrador. No celular, salve o link na tela inicial ("Adicionar à tela inicial").

**Por que "Qualquer pessoa"?** É só a porta de entrada. Sem e-mail e senha cadastrados, não se vê nenhum dado, porque toda ação confere a sessão no servidor.

### Atualizando para uma versão nova

1. Substitua o conteúdo dos arquivos alterados no editor.
2. Rode **Instalar / atualizar estrutura** de novo. Ele só cria o que falta e nunca apaga dados.
3. Vá em **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar**. O link continua o mesmo.

> Opcional, para quem quer automatizar: a ferramenta [clasp](https://github.com/google/clasp) envia a pasta `src/` direto para o Apps Script (`clasp push`), sem copiar e colar.

## Segurança e LGPD

- **Não compartilhe a planilha** nem a pasta do Drive com ninguém, porque elas guardam CPF e CNH. Os usuários acessam só pelo link do sistema.
- As senhas são guardadas como hash com salt. Depois de 5 tentativas erradas, o login fica bloqueado por 15 minutos.
- As sessões expiram após 6 horas sem uso.
- Este repositório não deve conter dados de clientes, chaves Pix ou senhas.

## Testar no computador (opcional, para desenvolvimento)

Com o Node.js instalado:

```bash
node dev/servidor-local.js
```

Abra http://localhost:8080 e entre com `admin@teste.com` / `Senha1234`. Os dados ficam só na memória e somem quando o servidor para.

## Roteiro

- **Fase 1 (em andamento):** ✅ base, usuários, veículos e motoristas · ⏳ manutenção com lembretes por km/data · ⏳ contrato em PDF · ⏳ vistoria de entrega e devolução
- **Fase 2:** cobranças (Pix) e situação de pagamento, despesas por veículo, infrações com prazo de indicação, FIPE e depreciação
- **Fase 3:** dashboard e e-mails automáticos
