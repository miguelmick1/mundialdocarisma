# Arquitetura técnica

## Fluxo

```text
Browser / PWA
   |
   | HTTPS + Session Cookie HttpOnly
   v
Next.js na Vercel
   |-- Route Handlers: autorização e regras de negócio
   |-- Server Components: páginas protegidas
   |
   v
Firebase Admin SDK
   |-- Firebase Authentication
   |-- Cloud Firestore
   `-- Audit logs
```

## Regra de confiança

- O navegador pode autenticar usando o Firebase Client SDK.
- O ID token é trocado imediatamente por um Session Cookie no backend.
- O navegador não grava palpites, resultados, rankings ou permissões diretamente no Firestore.
- Todas as decisões críticas são feitas em Route Handlers com o Firebase Admin SDK.
- Firestore Security Rules bloqueiam gravações diretas.

## Coleções

| Coleção | Finalidade |
|---|---|
| `users` | perfis humanos |
| `admins` | administradores ativos |
| `participants` | humanos e bots |
| `groups` | grupos privados |
| `groupMembers` | associação usuário/grupo |
| `groupInvites` | convites com token armazenado em hash |
| `teams` | seleções e status de eliminação |
| `matches` | tabela oficial e resultados |
| `roundMatches` | jogos reais de cada rodada do bolão |
| `guesses` | palpites efetivos |
| `guessHistory` | revisões imutáveis |
| `botGuessSources` | memória pública dos bots |
| `carismaSelections` | Time Carisma por rodada e participante |
| `scoreEvents` | eventos auditáveis de pontuação |
| `rankings` | projeção otimizada para leitura |
| `officialDraws` | sorteios e dados de verificação |
| `auditLogs` | operações administrativas |
| `idempotencyRequests` | prevenção de duplicidade |

## APIs principais

| Rota | Método | Uso |
|---|---|---|
| `/api/auth/csrf` | GET | token anti-CSRF |
| `/api/auth/session` | POST | troca ID token por cookie de sessão |
| `/api/auth/logout` | POST | encerra a sessão |
| `/api/matches` | GET | calendário e palpites do usuário |
| `/api/guesses` | PUT | autosave de palpite |
| `/api/carisma` | PUT | escolhe Time Carisma |
| `/api/groups` | POST | cria grupo privado |
| `/api/groups/:id/invites` | POST | cria convite seguro |
| `/api/bot-sources/:guessId` | GET | memória do bot após fechamento |
| `/api/admin/promote` | POST | adiciona o segundo administrador |
| `/api/admin/bot-override` | POST | altera bot com auditoria |
| `/api/admin/draw` | POST | sorteio oficial |
| `/api/admin/match-result` | POST | confirma ou anula partida |

## Pontuação

```text
Exato                5
Vencedor + saldo     4
Resultado            3
Erro                  0
```

Empate correto com placar diferente vale 3. O Time Carisma duplica a pontuação-base e soma o bônus real. Na Wild Card, o sistema seleciona o melhor dos dois resultados.

## Bots

Cada estratégia retorna dois objetos inseparáveis:

1. `prediction`: placar;
2. `source`: inputs, etapas, fontes, versão e hashes.

A memória é salva no momento do cálculo, nunca reconstruída com dados atuais.

## Evolução recomendada

1. importar e validar as 104 partidas;
2. carregar dataset econômico final;
3. contratar/configurar provedor de odds;
4. configurar rodadas e contests do mata-mata;
5. adicionar e-mail transacional;
6. adicionar SSE para ranking e sorteio ao vivo;
7. habilitar App Check e monitoramento de abuso.
