import { describe, expect, it } from "vitest";
import { resolveAvatarState } from "./avatar";

describe("avatar resolution", () => {
  it("uses the Google picture for a new account", () => {
    expect(resolveAvatarState({ tokenPicture: "https://google/avatar" })).toMatchObject({
      avatarUrl: "https://google/avatar",
      avatarSource: "GOOGLE",
    });
  });

  it("preserves a custom avatar after a new Google login", () => {
    expect(resolveAvatarState({
      storedAvatarUrl: "https://storage/custom",
      storedAvatarSource: "CUSTOM",
      tokenPicture: "https://google/avatar",
    })).toMatchObject({
      avatarUrl: "https://storage/custom",
      avatarSource: "CUSTOM",
      googleAvatarUrl: "https://google/avatar",
    });
  });

  it("respects the explicit choice to show initials", () => {
    expect(resolveAvatarState({
      storedAvatarSource: "INITIALS",
      tokenPicture: "https://google/avatar",
    })).toMatchObject({
      avatarUrl: null,
      avatarSource: "INITIALS",
      googleAvatarUrl: "https://google/avatar",
    });
  });
});
