import { describe, it, expect } from "vitest";
import { POST } from "../app/api/subscribe/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/subscribe", () => {
  const validBody = {
    email: "test@example.com",
    lat: 59.9,
    lng: 10.7,
    radius: 10,
    filters: ["smil", "strek", "sur"],
  };

  it("returns success for valid request", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe("Abonnement registrert");
  });

  it("rejects missing email", async () => {
    const res = await POST(makeRequest({ ...validBody, email: undefined }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("rejects invalid email without @", async () => {
    const res = await POST(makeRequest({ ...validBody, email: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("rejects email without domain dot", async () => {
    const res = await POST(makeRequest({ ...validBody, email: "test@nodot" }));
    expect(res.status).toBe(400);
  });

  it("rejects email with space", async () => {
    const res = await POST(makeRequest({ ...validBody, email: "test @example.com" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid latitude", async () => {
    const res = await POST(makeRequest({ ...validBody, lat: 91 }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid longitude", async () => {
    const res = await POST(makeRequest({ ...validBody, lng: 181 }));
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric coordinates", async () => {
    const res = await POST(makeRequest({ ...validBody, lat: "abc" }));
    expect(res.status).toBe(400);
  });

  it("rejects zero radius", async () => {
    const res = await POST(makeRequest({ ...validBody, radius: 0 }));
    expect(res.status).toBe(400);
  });

  it("rejects negative radius", async () => {
    const res = await POST(makeRequest({ ...validBody, radius: -5 }));
    expect(res.status).toBe(400);
  });

  it("rejects empty filters", async () => {
    const res = await POST(makeRequest({ ...validBody, filters: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid filter values", async () => {
    const res = await POST(makeRequest({ ...validBody, filters: ["invalid"] }));
    expect(res.status).toBe(400);
  });

  it("accepts partial valid filters", async () => {
    const res = await POST(makeRequest({ ...validBody, filters: ["smil"] }));
    expect(res.status).toBe(200);
  });

  it("returns 500 for malformed JSON", async () => {
    const req = new Request("http://localhost:3000/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
