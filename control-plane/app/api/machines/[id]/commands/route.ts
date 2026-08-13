import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedUser } from "@/lib/guardian-auth";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  "sleep-now",
  "cancel",
  "pause",
  "resume",
  "extend",
  "set-action",
] as const;

type CommandType = (typeof ALLOWED_TYPES)[number];

/**
 * Legt einen Befehl in die Queue. Der PC holt ihn beim nächsten
 * Heartbeat ab (max. ~5s Verzögerung).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorizedUser(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { type?: string; minutes?: number; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.type || !ALLOWED_TYPES.includes(body.type as CommandType)) {
    return NextResponse.json({ error: "unknown command type" }, { status: 400 });
  }

  const machine = await prisma.machine.findUnique({ where: { id } });
  if (!machine) {
    return NextResponse.json({ error: "machine not found" }, { status: 404 });
  }

  // Payload je nach Befehlstyp validieren
  let payload: Record<string, unknown> | null = null;

  if (body.type === "extend") {
    const minutes = Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 480) {
      return NextResponse.json(
        { error: "minutes must be between 1 and 480" },
        { status: 400 }
      );
    }
    payload = { minutes };
  }

  if (body.type === "set-action") {
    if (body.action !== "sleep" && body.action !== "shutdown") {
      return NextResponse.json(
        { error: "action must be 'sleep' or 'shutdown'" },
        { status: 400 }
      );
    }
    payload = { action: body.action };
  }

  const command = await prisma.machineCommand.create({
    data: { machineId: id, type: body.type, payload: payload ?? undefined },
  });

  return NextResponse.json({ id: command.id, queued: true });
}
