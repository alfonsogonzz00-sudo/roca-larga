import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("redirección tras iniciar sesión (safeNext)", () => {
  it("deja pasar rutas internas", () => {
    expect(safeNext("/partidos/abc?x=1#y")).toBe("/partidos/abc?x=1#y");
    expect(safeNext("/")).toBe("/");
  });
  it("bloquea destinos externos y trucos", () => {
    for (const bad of ["https://evil.example/x", "//evil.example/x", "/\\evil.example/x", "\\\\evil.example", "/\t/evil.example", "javascript:alert(1)", "", null, undefined, ["/a"], 42]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
