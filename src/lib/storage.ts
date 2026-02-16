export interface AttachmentResult {
    base64?: string;
    name: string;
}

export async function processAttachment(file: File): Promise<AttachmentResult> {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
        base64,
        name: file.name
    };
}
