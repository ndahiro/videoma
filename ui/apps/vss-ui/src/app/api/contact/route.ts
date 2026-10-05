import { NextRequest, NextResponse } from "next/server";
import { contactRequestsTable, db } from "@/lib/db";
import { sendContactNotification } from "@/lib/email";

/**
 * POST /api/contact — marketing contact form (CMSaasStarter's contact_us form).
 * Public endpoint: nothing here touches video data, only the inbox table.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = (typeof body?.message_body === "string" ? body.message_body.trim() : "").slice(0, 5000);
    const email = (typeof body?.email === "string" ? body.email.trim() : "").slice(0, 320);

    if (!email || !email.includes("@")) {
      return NextResponse.json({ message: "A valid email is required." }, { status: 400 });
    }
    if (message.length < 5) {
      return NextResponse.json(
        { message: "Tell us a little more (at least 5 characters)." },
        { status: 400 },
      );
    }

    const [row] = await db
      .insert(contactRequestsTable)
      .values({
        firstName: typeof body?.first_name === "string" ? body.first_name.trim() : null,
        lastName: typeof body?.last_name === "string" ? body.last_name.trim() : null,
        email,
        phone: typeof body?.phone === "string" ? body.phone.trim() : null,
        companyName:
          typeof body?.company_name === "string" ? body.company_name.trim() : null,
        messageBody: message,
        source: typeof body?.source === "string" ? body.source : "marketing_site",
      })
      .returning({ id: contactRequestsTable.id });

    // Best-effort notification; never fails the request.
    await sendContactNotification({
      firstName: body?.first_name,
      lastName: body?.last_name,
      email,
      companyName: body?.company_name,
      messageBody: message,
    }).catch((err) => console.error("[contact] notification failed:", err));

    return NextResponse.json({ ok: true, id: row?.id ?? null });
  } catch (error) {
    console.error("[contact] insert failed:", error);
    return NextResponse.json(
      { message: "Could not record your message. Please email us instead." },
      { status: 500 },
    );
  }
}
