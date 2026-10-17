# Órbita

Planner de estudos em HTML, CSS e JavaScript, hospedado na Vercel, com Supabase Auth e sincronização privada por conta.

## Estrutura

- `index.html`: estrutura da página.
- `styles.css` e `app.js`: interface e funcionalidades do planner.
- `auth.css` e `auth.js`: cadastro, login, recuperação, dados por conta e sincronização.
- `config.js`: URL do projeto e chave **publicável**; nunca incluir `service_role`, chave secreta ou senha.
- `vendor/`: SDK Supabase 2.118.0 fixado, distribuído com o site e acompanhado da licença.
- `supabase/migrations/`: histórico SQL aplicado ao projeto.
- `tests/`: verificações automatizadas da interface e teste opcional com contas temporárias.

## Hospedagem

O projeto continua estático, sem etapa de build. Na Vercel, use o diretório raiz, framework **Other**, sem Build Command e sem redirecionar arquivos JS/CSS para `index.html`.

O projeto Supabase é `khrmkwkjkgirdaalcefu`. A migração `20261017032756_create_private_planner_documents.sql` já foi aplicada. Não execute novamente no mesmo banco.

Em Supabase → Authentication → URL Configuration:

- Site URL: `https://orbita2-alpha.vercel.app/`
- Redirect URLs: `https://orbita2-alpha.vercel.app/**`

Para cadastro e recuperação públicos, configure um provedor SMTP em Authentication → Email → SMTP Settings. O serviço padrão do Supabase é restrito a destinatários autorizados da equipe e não substitui o envio de produção. A confirmação de e-mail permanece habilitada.

## Como os dados são protegidos

`planner_documents` contém um documento JSON privado por usuário, com chave primária `user_id` e políticas RLS que restringem leitura, criação e atualização ao dono autenticado. Não há acesso anônimo à tabela nem chave administrativa no navegador.

Cada atualização inclui a revisão conhecida; o banco incrementa a revisão. Se outro dispositivo alterou os dados, a interface pede uma escolha em vez de sobrescrever silenciosamente. As duas versões são preservadas localmente antes da resolução. O tamanho máximo do documento é 5 MiB.

Os dados locais são separados por conta. O histórico anterior em `orbita2data` é preservado e pode ser importado explicitamente. O cronômetro em andamento fica no dispositivo onde foi iniciado. A sincronização ocorre após alterações e verifica atualizações a cada 20 segundos com a página visível.

O botão de apagar dados limpa os estudos da conta e sincroniza essa ação; não exclui o usuário do Supabase. O usuário pode continuar sem conta, com armazenamento apenas no navegador.

## Validação

O painel inicial inclui um gráfico diário com escalas semanal, mensal e anual, navegação entre períodos e exploração por toque, cursor ou teclado. Os totais vêm das sessões registradas; dias futuros não entram na média. A referência diária deriva da meta semanal e pode ser ocultada.

Execute `node tests/study-chart.cjs` para verificar a agregação, anos bissextos, mudanças de período, interação, temas e responsividade. Os testes também conferem o tamanho mínimo dos campos no mobile para evitar a ampliação automática do Safari. A validação no aparelho físico continua recomendada.

Os testes de interface usam Playwright com Microsoft Edge e um servidor HTTP temporário local. `tests/auth-browser.cjs` simula apenas o transporte Supabase, mantendo o SDK real, e cobre autenticação, recuperação PKCE, sincronização, conflitos, importação, contas distintas e navegação responsiva.

Com `playwright@1.62.1` disponível no ambiente, execute `node tests/auth-browser.cjs`. Se o módulo estiver instalado fora do projeto, indique o caminho absoluto por `ORBITA_PLAYWRIGHT_MODULE`. O Microsoft Edge deve estar instalado; não é necessário baixar um navegador separado.

`tests/auth-live.cjs` requer dois UUIDs de contas explicitamente criadas para teste, no projeto configurado. Não o execute com contas reais de usuários. Os testes desta implementação usaram contas temporárias, encerraram as sessões e removeram as contas ao final.

Também foram executados testes SQL transacionais de RLS, propriedade dos registros, concorrência e formato do documento, com rollback, e verificações de segurança e desempenho do Supabase.

O fluxo de confirmação/recuperação foi verificado com respostas simuladas; a entrega real de e-mails depende da configuração SMTP do projeto.
