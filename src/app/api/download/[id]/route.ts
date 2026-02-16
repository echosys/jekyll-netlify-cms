import { NextRequest, NextResponse } from "next/server";
import { getAttachment } from "@/app/actions";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (isNaN(id)) {
        return new NextResponse("Invalid ID", { status: 400 });
    }

    const attachment = await getAttachment(id);
    if (!attachment || !attachment.data) {
        return new NextResponse("Attachment not found", { status: 404 });
    }

    const data = Buffer.from(attachment.data, 'base64');

    return new NextResponse(data, {
        headers: {
            "Content-Disposition": `attachment; filename="${attachment.name}"`,
            "Content-Type": "application/octet-stream",
        },
    });
}
