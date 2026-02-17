"use server";

import { db } from "@/lib/db";
import { processAttachment } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export interface Post {
    id: number;
    title: string;
    content: string;
    attachment_name: string | null;
    attachment_data: string | null;
    tags: string[];
    created_at: Date;
}

// Initialize a post and return its ID
export async function initializePost(title: string, content: string, tags: string[], attachmentName: string | null) {
    const { rows } = await db.query(
        "INSERT INTO posts (title, content, attachment_name, tags) VALUES ($1, $2, $3, $4) RETURNING id",
        [title, content, attachmentName, tags]
    );
    return rows[0].id;
}

// Insert a chunk of base64 data into the post_chunks table
export async function uploadChunk(postId: number, formData: FormData, chunkIndex: number) {
    const chunkData = formData.get("chunk") as string;
    await db.query(
        "INSERT INTO post_chunks (post_id, chunk_index, data) VALUES ($1, $2, $3)",
        [postId, chunkIndex, chunkData]
    );
}

// Finalize doesn't need to do much since we updated as we went, 
// but we can use this to revalidate or set a 'status' if we had one.
export async function finalizePost() {
    revalidatePath("/");
}

// Keeping the original createPost for backward compatibility or small files if needed, 
// but the frontend will switch to the new flow.
// We can actually remove it or deprecate it. Let's comment out the old one to avoid confusion.
/*
export async function createPost(formData: FormData) {
    ... original code ...
}
*/

// Update metadata and optionally prepare for new attachment
export async function startUpdatePost(id: number, title: string, content: string, tags: string[], attachmentName: string | null, clearAttachment: boolean) {
    if (clearAttachment) {
        // Clear metadata
        await db.query(
            "UPDATE posts SET title = $1, content = $2, tags = $3, attachment_name = $4 WHERE id = $5",
            [title, content, tags, attachmentName, id]
        );
        // Delete old chunks
        await db.query("DELETE FROM post_chunks WHERE post_id = $1", [id]);
    } else {
        await db.query(
            "UPDATE posts SET title = $1, content = $2, tags = $3 WHERE id = $4",
            [title, content, tags, id]
        );
    }
}

export async function deletePost(id: number) {
    await db.query("DELETE FROM posts WHERE id = $1", [id]);
    revalidatePath("/");
}

export async function getPosts(tag?: string): Promise<Post[]> {
    let query = "SELECT id, title, content, attachment_name, tags, created_at FROM posts";
    let params: any[] = [];

    if (tag && tag !== "all") {
        query += " WHERE $1 = ANY(tags)";
        params.push(tag);
    }

    query += " ORDER BY created_at DESC";

    const { rows } = await db.query(query, params);
    return rows;
}

export async function getAllTags(): Promise<string[]> {
    const { rows } = await db.query("SELECT DISTINCT unnest(tags) as tag FROM posts ORDER BY tag ASC");
    return rows.map(r => r.tag);
}

export async function getPost(id: number): Promise<Post | null> {
    const { rows } = await db.query("SELECT id, title, content, attachment_name, tags, created_at FROM posts WHERE id = $1", [id]);
    return rows[0] || null;
}

export async function getAttachment(id: number) {
    const postRows = await db.query(
        "SELECT attachment_name FROM posts WHERE id = $1",
        [id]
    );

    const post = postRows.rows[0];
    if (!post || !post.attachment_name) return null;

    // Fetch all chunks in order
    const chunkRows = await db.query(
        "SELECT data FROM post_chunks WHERE post_id = $1 ORDER BY chunk_index ASC",
        [id]
    );

    const fullData = chunkRows.rows.map(r => r.data).join("");

    return {
        name: post.attachment_name,
        data: fullData
    };
}
