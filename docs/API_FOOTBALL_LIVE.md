# Configuração consolidada — API-Football + Google Cloud Scheduler

## 1. Variáveis locais

No `.env.local`:

```env
API_FOOTBALL_KEY=SUA_CHAVE_DA_API_FOOTBALL
LIVE_SCORE_CRON_SECRET=UM_SEGREDO_ALEATORIO_COM_PELO_MENOS_32_CARACTERES
```

Para gerar o segredo no PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Nunca use o prefixo `NEXT_PUBLIC_` nessas variáveis.

## 2. Testes do projeto

```powershell
npm install
npm run typecheck
npm test
npm run build
```

## 3. Vincular os jogos à API-Football

Depois de configurar a chave:

```powershell
npm run link:api-football
```

Ou, com o site rodando, acesse:

```text
/admin/resultados
```

E clique em **Vincular jogos**.

A operação pode ser repetida. Ela faz `merge` e não apaga palpites, resultados ou pontuações.

## 4. Testar localmente

```powershell
npm run dev
```

Acesse `/admin/resultados` e clique em **Atualizar agora**.

A página deve mostrar:

- chave configurada;
- número de jogos vinculados;
- última sincronização;
- cota restante, quando informada pela API.

## 5. Variáveis na Vercel

Em **Settings → Environment Variables**, crie:

```text
API_FOOTBALL_KEY
LIVE_SCORE_CRON_SECRET
```

Use exatamente os mesmos valores do `.env.local` e marque **Production** e **Preview**.

Depois faça um novo deployment.

## 6. Google Cloud Scheduler

Use o mesmo projeto Google Cloud do Firebase.

### Configuração do job

- Nome: `mundialdocarisma-live-score`
- Frequência: `* * * * *`
- Fuso: `America/Sao_Paulo`
- Tipo de destino: `HTTP`
- URL:

```text
https://SEU-DOMINIO-VERCEL/api/live-score/sync
```

- Método: `POST`
- Header:

```text
X-Live-Score-Secret: MESMO_VALOR_DE_LIVE_SCORE_CRON_SECRET
```

- Header adicional:

```text
Content-Type: application/json
```

- Body:

```json
{}
```

- Autenticação Google/OIDC: nenhuma. O endpoint usa o segredo do header.
- Deadline recomendado: 30 segundos.

Após criar, use **Force run / Executar agora** para testar.

## 7. Conferência

Abra `/admin/resultados` e verifique se **Último sucesso** foi atualizado.

Na página `/resultados`:

- participantes solicitam atualização a cada 30 segundos;
- somente uma chamada externa é permitida por janela de cache;
- o placar atualizado aparece para todos pelo Firestore/API interna.

## 8. Comportamento operacional

- O Scheduler chama a Vercel a cada minuto.
- Fora de uma janela de jogo, o endpoint não consome a API-Football.
- A API é consultada aproximadamente de 20 minutos antes até 6 horas depois do início de uma partida, ou enquanto houver jogo marcado como ao vivo.
- A API grava apenas resultado provisório.
- O administrador confirma o resultado em `/admin/resultados`.
- Uma edição manual pausa a atualização automática daquele jogo.
- O botão **Retomar API** remove essa pausa.

## 9. Falhas

Se a API falhar:

- o último placar válido permanece;
- a página mostra um aviso discreto;
- o erro aparece no painel administrativo;
- a operação manual continua disponível;
- nenhuma pontuação oficial é calculada automaticamente.
