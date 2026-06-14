import { describe, expect, it } from "vitest";
import { canCreateServerSession } from "@/lib/auth/registration";

describe("fechamento de inscrições", () => {
  it("permite participantes existentes quando as inscrições estão fechadas", () => {
    expect(canCreateServerSession({ registrationOpen: false, userExists: true, userStatus: "ACTIVE" })).toBe(true);
  });

  it("bloqueia novos UIDs e participantes inativos quando as inscrições estão fechadas", () => {
    expect(canCreateServerSession({ registrationOpen: false, userExists: false })).toBe(false);
    expect(canCreateServerSession({ registrationOpen: false, userExists: true, userStatus: "INACTIVE" })).toBe(false);
  });

  it("permite bootstrap de novos usuários somente quando as inscrições estão abertas", () => {
    expect(canCreateServerSession({ registrationOpen: true, userExists: false })).toBe(true);
  });
});
