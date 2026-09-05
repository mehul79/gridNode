import { NextResponse } from "next/server";

// Liveness probe for the container HEALTHCHECK and the post-deploy gate.
// Static so it never depends on the backend or the database being reachable.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ status: "ok", service: "gridnode-fe" });
}
