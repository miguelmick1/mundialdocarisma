# Alterações — Time Carisma, classificação e palpites públicos

## Implementado

1. **Time Carisma único na fase de grupos**
   - A mesma seleção vale nas rodadas 1, 2 e 3.
   - A escolha pode ser alterada até o início do primeiro jogo da seleção escolhida.
   - Ao salvar uma escolha da fase de grupos, o sistema sincroniza automaticamente as três rodadas.
   - Registros antigos gravados separadamente por rodada são tratados de forma compatível: a escolha da rodada 1 prevalece; na ausência dela, usa-se a primeira escolha existente.

2. **Cores do Time Carisma na classificação**
   - As linhas dos participantes humanos usam as cores da seleção escolhida.
   - A bandeira e o nome do Time Carisma aparecem junto ao participante.

3. **Quatro grupos na mesma página**
   - Os grupos A, B, C e D aparecem em sequência, sem exigir troca de aba.
   - Foram incluídos atalhos fixos para navegar entre os grupos.

4. **Renomeação do bot**
   - `OddMestre` passou a ser exibido como **Betinho Everyday**.
   - A normalização também vale para sorteios, classificações, resultados, painel administrativo e memórias antigas de cálculo.
   - O identificador interno `bot-oddmestre` foi mantido para não quebrar dados existentes.

5. **Fotos na classificação**
   - Uma das três fotos da turma aparece na página de classificação.
   - A escolha é aleatória e evita repetir a última foto exibida na mesma sessão do navegador.

6. **Palpites de todos**
   - A página Palpites agora possui as abas `Meus palpites` e `Palpites de todos`.
   - A nova visualização permite filtrar por rodada, grupo, situação, tipo de participante e nome.
   - Os palpites dos demais participantes são liberados somente após o início da partida, evitando cópia antes do fechamento.
   - A tabela identifica quando aquela partida é do Time Carisma de cada participante.

7. **Regulamento e textos do site**
   - O regulamento foi atualizado com a regra do Time Carisma único nas três rodadas.
   - Textos da central de palpites e do dashboard foram atualizados.

## Compatibilidade e implantação

- Não é necessária migração manual dos documentos antigos de Time Carisma.
- Novas escolhas são gravadas nas três rodadas da fase de grupos.
- A leitura e o cálculo de pontuação aplicam a escolha canônica também aos registros antigos.
- O build foi limitado a dois workers no `next.config.ts`, reduzindo consumo de memória e evitando travamento na etapa de geração de páginas em ambientes com muitos núcleos reportados.

## Validação

- TypeScript: aprovado.
- Testes automatizados: 29 testes aprovados.
- Build de produção: aprovado, com 26 páginas geradas.
