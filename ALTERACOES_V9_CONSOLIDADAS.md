# Atualização consolidada v9

Este pacote reúne integralmente a atualização anterior de automação dos bots e as correções posteriores solicitadas.

## Correção do build da Vercel

- O cálculo de pontuação não envia mais `carismaTeamId: undefined`.
- O campo só é incluído quando existe uma seleção de Time Carisma válida para o participante.
- A correção elimina o erro de TypeScript apresentado em `src/app/api/admin/match-result/route.ts`.

## Classificação com quatro grupos

- Os grupos A, B, C e D são renderizados simultaneamente na mesma página.
- No desktop, as quatro tabelas ficam organizadas em uma grade 2 × 2.
- A página de classificação ganhou largura ampliada e tabelas compactas.
- Em telas menores, todos os grupos continuam na mesma página e são empilhados responsivamente.

## Regras dos bots

- Maria Vai com as Outras: palpite automático após o início da partida, pela média dos palpites principais dos humanos ativos.
- Pangaré: palpite automático após o início da partida, pela estratégia determinística já definida.
- Betinho Everyday: palpite manual preenchido pelo administrador antes do início da partida.
- Transbot: palpite manual preenchido pelo administrador antes do início da partida.
- O painel administrativo identifica claramente quais bots são automáticos e quais são manuais.
- Um palpite manual informado para Maria ou Pangaré antes do jogo impede a geração automática duplicada naquele jogo.

## Validação

- Testes automatizados aprovados.
- Verificação de TypeScript aprovada.
- Build de produção do Next.js aprovado com geração das 26 páginas.
