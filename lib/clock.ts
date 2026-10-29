import "server-only";
import { connection } from "next/server";

/** Current time of the request. Marks the render as dynamic: the game day is never baked into a build. */
export async function requestNow(): Promise<number> {
  await connection();
  return Date.now();
}
