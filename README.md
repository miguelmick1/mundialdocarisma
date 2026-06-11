# Super Bolão Copa do Mundo 2026

Aplicação full-stack em **Next.js + TypeScript + Firebase**, preparada para publicação na **Vercel**.

O repositório contém um MVP funcional e extensível com:

- login por Google, Apple e e-mail/senha;
- sessão Firebase em cookie `HttpOnly`, sem token persistente no navegador;
- administrador inicial configurado por e-mail;
- inclusão de um segundo administrador com os mesmos poderes;
- calendário e fábrica de palpites com autosave;
- bloqueio dos palpites exatamente no início da partida, pelo relógio do servidor;
- histórico de alterações e idempotência;
- pontuação 5/4/3, Time Carisma e Wild Card;
- quatro bots participantes, sendo Maria Vai com as Outras e Pangaré os dois bots com palpites automáticos nesta edição;
- memória pública e auditável dos palpites automáticos;
- grupos privados e convites que sobrevivem ao redirecionamento do login;
- sorteio criptograficamente seguro para desempates;
- registro e anulação de resultados;
- ranking com primeiro desempate por número de placares exatos;
- importador CSV do calendário oficial;
- regras restritivas do Firestore;
- testes automatizados e workflow de CI no GitHub.

> O CSV incluído contém uma amostra inicial de partidas oficiais para validar a importação. O importador já está preparado para receber as 104 partidas no mesmo formato. Isso evita prender a aplicação a scraping frágil do site da FIFA.

---

## 1. Requisitos no computador

Instale:

1. **Node.js 22 LTS ou superior**
2. **Git**
3. **Visual Studio Code**
4. Uma conta no **GitHub**
5. Uma conta no **Firebase / Google Cloud**
6. Uma conta na **Vercel**

Confira no terminal do VS Code:

```bash
node -v
git --version
npm -v
```

---

## 2. Abrir o projeto no VS Code

Descompacte o arquivo e abra a pasta `super-bolao-2026` no VS Code.

No terminal integrado:

```bash
npm install
```

Depois:

```bash
npm run typecheck
npm test
```

---

## 3. Criar o projeto no Firebase

### 3.1 Criar o projeto

1. Abra o Firebase Console.
2. Clique em **Create a project / Criar um projeto**.
3. Nome sugerido: `super-bolao-copa-2026`.
4. O Google Analytics é opcional para o MVP.

### 3.2 Criar o aplicativo web

1. Em **Project overview**, clique no ícone `</>`.
2. Nome sugerido: `super-bolao-web`.
3. Não é necessário ativar Firebase Hosting, pois o site ficará na Vercel.
4. Ao final, o Firebase mostrará algo semelhante a:

```ts
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...firebaseapp.com",
  projectId: "...",
  storageBucket: "...firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

Esses valores serão copiados para as variáveis que começam com `NEXT_PUBLIC_`.

### 3.3 Ativar Authentication

No Firebase Console:

1. **Build > Authentication > Get started**.
2. Em **Sign-in method**, ative:
   - Email/Password;
   - Google;
   - Apple, quando sua configuração Apple Developer estiver pronta.
3. Em **Settings > Authorized domains**, mantenha `localhost` e depois adicione:
   - o domínio entregue pela Vercel;
   - seu domínio personalizado, quando houver.

#### Apple

O botão Apple já está preparado no código, mas o provedor só funcionará após configurar no Firebase os dados do Apple Developer: Service ID, Team ID, Key ID e chave privada. Enquanto isso, você pode manter o botão desativado com a variável explicada abaixo.

### 3.4 Criar o Firestore

1. **Build > Firestore Database > Create database**.
2. Escolha **Production mode**.
3. Escolha uma região próxima dos usuários e mantenha-a definitiva; a localização do banco não pode ser alterada depois.
4. Não crie as coleções manualmente. Os scripts `seed` e `import:fifa` farão isso.

### 3.5 Criar a Service Account

1. Firebase Console > engrenagem > **Project settings**.
2. Aba **Service accounts**.
3. Clique em **Generate new private key**.
4. Guarde o JSON em local seguro.
5. **Nunca coloque esse JSON no GitHub.**

Dentro do JSON você encontrará:

```json
{
  "project_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-...@....iam.gserviceaccount.com"
}
```

---

## 4. Criar o `.env.local`

Na raiz do projeto:

### Windows PowerShell

```powershell
Copy-Item .env.example .env.local
```

### macOS/Linux

```bash
cp .env.example .env.local
```

Abra `.env.local` no VS Code e preencha:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=valor_do_apiKey
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=seu-projeto.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=valor_do_messagingSenderId
NEXT_PUBLIC_FIREBASE_APP_ID=valor_do_appId

FIREBASE_PROJECT_ID=valor_de_project_id_do_json
FIREBASE_CLIENT_EMAIL=valor_de_client_email_do_json
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nLINHAS_DA_CHAVE\n-----END PRIVATE KEY-----\n"

BOOTSTRAP_ADMIN_EMAIL=miguelmickelberg@gmail.com
MAX_ACTIVE_ADMINS=2
SESSION_DAYS=5
APP_URL=http://localhost:3000
APP_SECRET=COLOQUE_UMA_SEQUENCIA_ALEATORIA_LONGA
NEXT_PUBLIC_ENABLE_APPLE_AUTH=false
```

### Como copiar a `FIREBASE_PRIVATE_KEY`

Para o `.env.local`, use a chave em uma única variável entre aspas, preservando os caracteres literais `\n`:

```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n...\n-----END PRIVATE KEY-----\n"
```

Não deixe que o editor transforme a chave em várias variáveis separadas.

### Como gerar o `APP_SECRET`

PowerShell:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

macOS/Linux:

```bash
openssl rand -base64 48
```

Copie o resultado para `APP_SECRET`. Ele é usado, entre outras coisas, para tornar o Pangaré determinístico e auditável. Não deve ser público.

---

## 5. Implantar as regras do Firestore

Instale o Firebase CLI:

```bash
npm install -g firebase-tools
```

Faça login:

```bash
firebase login
```

Na pasta do projeto:

```bash
firebase use --add
```

Escolha o projeto Firebase criado anteriormente e dê um alias, por exemplo `default`.

Publique regras e índices:

```bash
firebase deploy --only firestore
```

As regras bloqueiam gravação direta nas coleções críticas. As gravações acontecem nas APIs do Next.js usando o Firebase Admin SDK.

---

## 6. Criar a base inicial

Com `.env.local` preenchido:

```bash
npm run seed
```

O seed cria:

- os quatro bots participantes;
- um jogo de demonstração já fechado;
- palpites de demonstração somente para Maria Vai com as Outras e Pangaré;
- Betinho Everyday e Transbot com palpites preenchidos manualmente pelo administrador;
- ranking inicial de demonstração.

Depois importe as partidas do CSV:

```bash
npm run import:fifa
```

Arquivo usado:

```text
data/fifa-2026-matches.csv
```

Formato:

```csv
matchNumber,kickoffIso,phase,group,homeTeamId,homeTeamName,awayTeamId,awayTeamName,venue,sourceUrl
```

Use sempre `kickoffIso` em UTC, por exemplo:

```text
2026-06-11T19:00:00.000Z
```

Para importar outro arquivo:

```bash
npm run import:fifa -- caminho/arquivo.csv
```

O processo é um **upsert** pelo número oficial da partida; pode ser executado novamente para atualizar dados.

---

## 7. Rodar localmente

```bash
npm run dev
```

Abra:

```text
http://localhost:3000
```

Entre inicialmente com:

```text
miguelmickelberg@gmail.com
```

O e-mail precisa estar verificado. Na primeira sessão válida, o backend cria o documento de administrador e aplica a custom claim.

Caso a permissão não apareça imediatamente:

1. saia do site;
2. entre novamente;
3. abra `/admin`.

Como alternativa de emergência:

```bash
npm run promote:admin -- miguelmickelberg@gmail.com
```

---

## 8. Testar os principais fluxos

### Palpites

1. Entre no site.
2. Abra **Palpites**.
3. Digite um placar.
4. Aguarde o estado `Salvo ✓`.
5. Verifique o documento em `guesses` no Firestore.

### Fontes e automação dos bots

1. Abra **Bots**.
2. No jogo de demonstração, consulte a memória de Maria ou Pangaré.
3. Verifique inputs, fórmulas e hashes.
4. Em produção, os dois palpites são criados depois do início de cada partida, quando os palpites humanos já estão bloqueados.

Também é possível executar o processamento manualmente:

```bash
npm run bots:process
```

A rota `GET /api/cron/bot-guesses` permite acionar o mesmo processamento por um agendador. Cadastre `CRON_SECRET` e envie `Authorization: Bearer <CRON_SECRET>`. Mesmo sem agendador externo, o processamento é acionado pelos principais acessos do site e obrigatoriamente antes da confirmação de um resultado.

### Segundo administrador

1. O segundo usuário precisa criar a conta e verificar o e-mail.
2. O administrador abre `/admin`.
3. Informa o e-mail e confirma.
4. O novo administrador sai e entra novamente.

### Sorteio

1. Em `/admin`, informe um ID único de confronto.
2. Informe os participantes.
3. Clique em iniciar sorteio.
4. O resultado é gravado em `officialDraws` e não pode ser refeito com o mesmo ID.

---

## 9. Subir no GitHub pelo terminal do VS Code

### 9.1 Conferir que segredos estão ignorados

```bash
git status
```

O arquivo `.env.local` **não pode** aparecer na lista a ser enviada.

### 9.2 Inicializar o Git

```bash
git init
git add .
git commit -m "feat: cria Super Bolao Copa 2026"
```

### 9.3 Criar o repositório no GitHub

No GitHub:

1. Clique em **New repository**.
2. Nome sugerido: `super-bolao-2026`.
3. Escolha privado inicialmente.
4. Não adicione README, `.gitignore` ou licença pelo site, pois já existem localmente.

Copie a URL do repositório e execute:

```bash
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/super-bolao-2026.git
git push -u origin main
```

Nas atualizações seguintes:

```bash
git add .
git commit -m "descrição da alteração"
git push origin main
```

---

## 10. Publicar na Vercel

1. Entre na Vercel usando o GitHub.
2. Clique em **Add New > Project**.
3. Importe `super-bolao-2026`.
4. Framework: **Next.js**, detectado automaticamente.
5. Antes de publicar, abra **Environment Variables**.
6. Copie todas as variáveis do `.env.local`, uma a uma.

Configure para **Production**, **Preview** e **Development**, conforme necessário.

### Chave privada na Vercel

Na interface da Vercel, a variável `FIREBASE_PRIVATE_KEY` pode ser colada com as quebras de linha reais ou com `\n`. O código aceita as duas formas.

Nunca crie uma variável pública com esse valor. Somente variáveis que começam com `NEXT_PUBLIC_` chegam ao navegador.

### Ajustar `APP_URL`

Após o primeiro deploy, altere:

```env
APP_URL=https://seu-projeto.vercel.app
```

Depois faça um novo deploy.

### Firebase Authorized Domains

Volte ao Firebase:

```text
Authentication > Settings > Authorized domains
```

Adicione:

```text
seu-projeto.vercel.app
```

Também adicione o domínio próprio quando configurá-lo.

---

## 11. Variáveis da Vercel via CLI — opcional

Instale e conecte:

```bash
npm install -g vercel
vercel login
vercel link
```

É mais seguro adicionar segredos pela interface. Caso use CLI, evite colocar segredos diretamente em comandos que ficam no histórico do terminal.

Para baixar variáveis de desenvolvimento já cadastradas:

```bash
vercel env pull .env.local
```

---

## 12. Estrutura principal

```text
src/
  app/
    api/                 APIs protegidas
    admin/               painel administrativo
    bots/                transparência dos bots
    palpites/            fábrica de palpites
    ranking/             classificação
  components/            componentes de interface
  lib/
    auth/                 sessão e administrador
    bots/                 estratégias dos quatro bots
    firebase/             client e Admin SDK
    groups/               convites
    scoring/              pontuação, Time Carisma e ranking
    security/             CSRF e cookies
  types/                  domínio
scripts/
  seed.ts
  import-fifa-csv.ts
  promote-admin.ts
data/
  fifa-2026-matches.csv
firestore.rules
firestore.indexes.json
```

---

## 13. Regras implementadas

- Palpites humanos fecham quando `serverTime >= kickoffAt`.
- Resultado válido: placar após até 120 minutos; pênaltis não entram.
- Placar exato: 5 pontos multiplicados pelo total de gols; 0 × 0 vale 10 pontos.
- Vencedor e saldo exato, sem placar exato: 4 pontos.
- Empate correto, sem placar exato: 4 pontos.
- Somente vencedor correto: 3 pontos.
- Time Carisma duplica somente a pontuação básica e é o mesmo nas três rodadas de grupos.
- Acerto sozinho total vale +30; acerto sozinho parcial vale +15.
- Bots não participam dos bônus de exclusividade.
- Wild Card usa o melhor de dois palpites, sem somar.
- Maria usa a média dos palpites principais dos humanos ativos, com 0,5 arredondado para cima.
- Pangaré usa os potes de força para definir favorito e azarão e mantém geração determinística.
- Betinho Everyday e Transbot recebem palpites manuais preenchidos pelo administrador antes das partidas.
- Partida anulada: eventos de pontuação são desativados e o ranking é recalculado.

---

## 14. Antes de abrir para os participantes

Checklist:

- [ ] Firebase Authentication configurado
- [ ] domínio Vercel autorizado no Firebase
- [ ] regras e índices publicados
- [ ] variáveis da Vercel preenchidas
- [ ] administrador inicial testado
- [ ] 104 partidas importadas e conferidas
- [ ] horários conferidos em UTC
- [ ] critérios e jogos das rodadas do mata-mata configurados
- [ ] potes de força das 48 seleções configurados
- [ ] `APP_SECRET` longo e estável configurado
- [ ] `CRON_SECRET` configurado, caso seja usado um agendador externo
- [ ] testes executados
- [ ] backup/exportação do Firestore planejado

---

## 15. Limitações conscientes deste pacote

A infraestrutura e os módulos centrais estão implementados, mas estes itens ainda dependem de definições ou credenciais externas:

1. o calendário das 104 partidas deve ser sincronizado e conferido com a versão oficial vigente;
2. as partidas que compõem cada etapa específica do mata-mata do bolão ainda serão configuradas conforme o avanço da Copa;
3. o login Apple exige conta e credenciais Apple Developer;
4. notificações por e-mail e atualizações ao vivo por SSE podem ser adicionadas como fase seguinte.

Betinho Everyday e Transbot continuam como participantes da competição e seus palpites são preenchidos manualmente pelo administrador antes do início das partidas.
