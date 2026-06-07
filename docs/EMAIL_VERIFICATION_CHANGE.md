# Alteração: acesso sem confirmação de e-mail

Esta versão remove a confirmação obrigatória de e-mail para usuários comuns.

Arquivos alterados:

- `src/components/LoginForm.tsx`: o cadastro cria a conta e inicia a sessão imediatamente.
- `src/app/api/auth/session/route.ts`: a sessão exige um e-mail presente, mas não exige `email_verified=true`.
- `src/app/api/admin/promote/route.ts`: o segundo administrador pode ser promovido sem e-mail verificado.
- `scripts/promote-admin.ts`: o script não bloqueia contas não verificadas.

A lógica de `src/lib/auth/bootstrap.ts` não foi alterada. Ela ainda exige e-mail verificado para conceder automaticamente o papel de administrador inicial.
