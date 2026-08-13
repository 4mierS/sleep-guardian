import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAgent } from "@/lib/guardian-auth";

export const dynamic = "force-dynamic";

/**
 * Der PC ruft das alle ~5s auf. Zwei Dinge passieren gleichzeitig:
 *   1. Status wird gespeichert (damit das Handy ihn sehen kann)
 *   2. Offene Befehle werden zurückgegeben und als abgeholt markiert
 */
export async function POST(req: Request) {
  const machine = await authenticateAgent(req);
  if (!machine) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    state?: string;
    reasons?: string[];
    msUntilSleep?: number | null;
    action?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Status aktualisieren + offene Befehle holen in EINER Transaktion,
  // damit kein Befehl verloren geht, wenn zwei Heartbeats überlappen.
  const commands = await prisma.$transaction(async (tx) => {
    await tx.machine.update({
      where: { id: machine.id },
      data: {
        name: body.name ?? machine.name,
        state: body.state ?? "active",
        reasons: body.reasons ?? [],
        msUntilSleep: body.msUntilSleep ?? null,
        action: body.action ?? machine.action,
        lastSeenAt: new Date(),
      },
    });

    const pending = await tx.machineCommand.findMany({
      where: { machineId: machine.id, consumedAt: null },
      orderBy: { createdAt: "asc" },
    });

    if (pending.length > 0) {
      await tx.machineCommand.updateMany({
        where: { id: { in: pending.map((c) => c.id) } },
        data: { consumedAt: new Date() },
      });
    }

    return pending;
  });

  return NextResponse.json({
    commands: commands.map((c) => ({
      type: c.type,
      ...(c.payload as Record<string, unknown> | null),
    })),
  });
}
