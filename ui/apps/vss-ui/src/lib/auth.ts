import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

// NEXT_PHASE is set during `next build` (static collection imports this
// module without runtime env) — only enforce at actual runtime.
if (
  !process.env.JWT_SECRET &&
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  throw new Error("JWT_SECRET must be set in production — refusing to sign tokens with a fallback secret.");
}
if (!process.env.JWT_SECRET) {
  console.warn("[auth] JWT_SECRET is not set; using an insecure dev fallback. Set JWT_SECRET in production.");
}
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "vss-dev-fallback-secret",
);

export interface TokenPayload {
  sub: string;   // user id
  username: string;
  role: string;
}

/** Hash a plain-text password. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** Compare a plain-text password against a hash. */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Create a signed JWT for the given user. */
export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

/** Verify and decode a JWT. Returns the payload or null if invalid. */
export async function decodeToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}
