# Automação de Maria, Pangaré e renomeação do Transbot

## Comportamento implementado

- **Maria Vai com as Outras** é gerada automaticamente depois do início de cada partida.
- A média considera somente o palpite principal (`slot = 1`) dos participantes humanos ativos.
- A média é calculada separadamente para mandante e visitante; valores terminados em 0,5 são arredondados para cima.
- **Pangaré** é gerado automaticamente depois do início de cada partida.
- O favorito é definido pelo pote de força: pote 1 prevalece sobre o 2, que prevalece sobre o 3.
- Em empate de potes ou ausência de informação, o lado favorito é escolhido por desempate determinístico baseado no `APP_SECRET` e no ID da partida.
- **Betinho Everyday** e **Transbot** permanecem na competição e recebem palpites manuais preenchidos pelo administrador.
- O painel administrativo bloqueia a criação manual de palpites para esses dois bots.
- Palpites de Betinho e Transbot podem ser criados e editados manualmente pelo administrador até o início da partida.

## Momento de execução

O processamento é acionado pelos principais acessos autenticados do site: dashboard, classificação, palpites, resultados, transparência e administração dos bots. Antes de confirmar qualquer resultado, o sistema também força o processamento daquela partida.

Opcionalmente, um agendador pode chamar:

```text
GET /api/cron/bot-guesses
Authorization: Bearer <CRON_SECRET>
```

Também há execução manual pelo terminal:

```bash
npm run bots:process
```

## Compatibilidade

- O ID interno `bot-faria` e a estratégia interna `FARIA_LIMMER` foram preservados para não quebrar documentos históricos.
- O nome público passou a ser **Transbot** em todas as telas e também ao exibir registros antigos.
