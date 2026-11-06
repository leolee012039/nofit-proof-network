import { describe, expect, it } from "vitest";
import { getAppBaseUrl, isLocalDeployment } from "@/lib/config";
import { AppError } from "@/lib/domain/errors";
import { booleanField, errorResponse, readJson, stringField } from "@/lib/http";

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/x", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("request bodies (ECC review)", () => {
  it("accepts only JSON objects", async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(post(""))).toEqual({});
    for (const bad of ["[1,2]", "null", "42", '"text"', "{nope"]) {
      await expect(readJson(post(bad))).rejects.toMatchObject({ code: "VALIDATION" });
    }
  });

  it("refuses a body declared too large before reading it", async () => {
    await expect(readJson(post("{}", { "content-length": String(10 * 1024 * 1024) }))).rejects.toMatchObject({
      code: "VALIDATION",
      message: expect.stringMatching(/too large/),
    });
  });

  it("typed fields: a wrong type is a 400, never coerced", () => {
    expect(stringField({ id: "pc_1" }, "id", { required: true })).toBe("pc_1");
    expect(stringField({}, "id")).toBeUndefined();
    expect(() => stringField({}, "id", { required: true })).toThrow(/required/);
    expect(() => stringField({ id: 42 }, "id")).toThrow(/must be a string/);
    expect(() => stringField({ id: { $ne: 1 } }, "id")).toThrow(/must be a string/);
    expect(() => stringField({ id: "x".repeat(201) }, "id")).toThrow(/too long/);
    expect(booleanField({ ack: true }, "ack")).toBe(true);
    expect(booleanField({}, "ack")).toBe(false);
    expect(() => booleanField({ ack: "true" }, "ack")).toThrow(/boolean/);
  });

  it("a unique-constraint race is a 409 conflict, not a 500", async () => {
    const res = errorResponse({ cause: { code: "23505" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
    expect(errorResponse(new AppError("NOT_FOUND", "x")).status).toBe(404);
  });
});

describe("deployment detection fails closed (ECC review)", () => {
  it("a production build without APP_BASE_URL is not treated as localhost", () => {
    expect(isLocalDeployment(env({ NODE_ENV: "production" }))).toBe(false);
    expect(isLocalDeployment(env({ NODE_ENV: "production", APP_BASE_URL: "http://localhost:3000" }))).toBe(true);
    expect(isLocalDeployment(env({ NODE_ENV: "production", APP_BASE_URL: "https://nofit-demo.example" }))).toBe(false);
    expect(isLocalDeployment(env({}))).toBe(true);
  });

  it("on Render, the public URL comes from RENDER_EXTERNAL_URL and is never treated as localhost", () => {
    const render = env({ NODE_ENV: "production", RENDER_EXTERNAL_URL: "https://nofit-proof-network.onrender.com" });
    expect(getAppBaseUrl(render)).toBe("https://nofit-proof-network.onrender.com");
    expect(isLocalDeployment(render)).toBe(false);
    expect(getAppBaseUrl(env({ APP_BASE_URL: "https://demo.example/", RENDER_EXTERNAL_URL: "https://x.onrender.com" }))).toBe(
      "https://demo.example",
    );
  });
});
