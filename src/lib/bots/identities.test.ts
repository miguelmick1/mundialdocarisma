import { describe, expect, it } from "vitest";
import { botGuessMode, botGuessingEnabled } from "@/lib/bots/identities";

describe("modos de palpite dos bots", () => {
  it("mantém Maria e Pangaré automáticos", () => {
    expect(botGuessMode({ id: "bot-maria" })).toBe("AUTOMATIC");
    expect(botGuessMode({ id: "bot-pangare" })).toBe("AUTOMATIC");
  });

  it("mantém Betinho Everyday e Transbot manuais e habilitados", () => {
    expect(botGuessMode({ id: "bot-oddmestre" })).toBe("MANUAL");
    expect(botGuessMode({ id: "bot-faria" })).toBe("MANUAL");
    expect(botGuessingEnabled({ id: "bot-oddmestre" })).toBe(true);
    expect(botGuessingEnabled({ id: "bot-faria" })).toBe(true);
  });
});
