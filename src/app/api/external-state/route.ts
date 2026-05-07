import { NextResponse } from "next/server";
import {
  parseExternalScreenPayload,
  type ExternalScreenPayload,
  type ExternalScreenState,
} from "@/lib/external/screenState";

export const dynamic = "force-dynamic";

let latestState: ExternalScreenState | null = null;

export async function GET() {
  return NextResponse.json({ state: latestState });
}

export async function POST(request: Request) {
  let body: ExternalScreenPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: ["request body must be JSON"] }, { status: 400 });
  }

  const result = parseExternalScreenPayload(body);
  if (!result.ok || !result.state) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  latestState = result.state;
  return NextResponse.json({ state: latestState });
}
