"use client";

import { getPost, startUpdatePost, uploadChunk, finalizePost } from "../../actions";
import Link from "next/link";
import { ArrowLeft, Save, Upload, Tags, X, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

const CHUNK_SIZE = 1024 * 1024 * 3; // 3MB Chunks (Multiple of 3 to avoid b64 padding)

export default function EditPost() {
    const [post, setPost] = useState<any>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [uploadedMB, setUploadedMB] = useState(0);
    const [totalMB, setTotalMB] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const params = useParams();
    const id = parseInt(params.id as string);

    useEffect(() => {
        async function fetchPost() {
            const data = await getPost(id);
            if (data) {
                setPost(data);
                setFileName(data.attachment_name);
            }
            setIsLoading(false);
        }
        fetchPost();
    }, [id]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setFileName(file ? file.name : null);
    };

    async function handleSubmit(formData: FormData) {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setUploadProgress(0);
        setUploadStatus("Starting update...");

        try {
            const title = formData.get("title") as string;
            const content = formData.get("content") as string;
            const tagsInput = formData.get("tags") as string;
            const tags = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(t => t !== "") : [];
            const file = formData.get("attachment") as File | null;

            // Determine if we are uploading a new file or keeping old one or removing it
            const hasNewFile = file && file.size > 0;
            const isRemovingFile = !fileName && post.attachment_name;
            const isAttachmentChanged = hasNewFile || isRemovingFile;

            // 1. Update Post Metadata
            setUploadStatus("Updating post info...");
            await startUpdatePost(id, title, content, tags, fileName, isAttachmentChanged);

            if (hasNewFile) {
                // 2. Chunked Upload
                const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
                setTotalMB(Number((file.size / (1024 * 1024)).toFixed(1)));
                setUploadedMB(0);

                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunk = file.slice(start, end);

                    // Convert chunk to base64
                    const reader = new FileReader();
                    const base64Promise = new Promise<string>((resolve) => {
                        reader.onload = () => {
                            const result = reader.result as string;
                            const base64 = result.split(",")[1];
                            resolve(base64);
                        };
                        reader.readAsDataURL(chunk);
                    });

                    const base64Data = await base64Promise;

                    setUploadStatus(`Uploading chunk ${i + 1} of ${totalChunks}...`);

                    // Use FormData to bypass RSC string serialization limits/nesting errors
                    const chunkFormData = new FormData();
                    chunkFormData.append("chunk", base64Data);
                    await uploadChunk(id, chunkFormData, i);

                    const currentUploadedMB = Number(((i + 1) * CHUNK_SIZE / (1024 * 1024)).toFixed(1));
                    setUploadedMB(Math.min(currentUploadedMB, totalMB));

                    const progress = Math.round(((i + 1) / totalChunks) * 100);
                    setUploadProgress(progress);
                }
            }

            setUploadStatus("Finalizing...");
            await finalizePost();
            setUploadStatus("Done!");
            router.push("/?success=true");
        } catch (error) {
            console.error("Failed to update post:", error);
            setUploadStatus("Update failed. Please try again.");
            setIsSubmitting(false);
        }
    }

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-8 h-8 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
        </div>
    );

    if (!post) return (
        <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-white mb-4">Post not found</h2>
            <Link href="/" className="text-teal-400 hover:underline">Back to Blog</Link>
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto">
            {/* Progress Banner */}
            {isSubmitting && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md">
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-2xl space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400 flex items-center gap-2">
                                {uploadProgress === 100 ? <CheckCircle2 size={16} className="text-teal-400" /> : <div className="w-3 h-3 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />}
                                {uploadStatus}
                            </span>
                            <span className="text-teal-400 font-bold">{uploadedMB}MB / {totalMB}MB ({uploadProgress}%)</span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-teal-500 to-blue-500 h-full transition-all duration-300"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-8">
                <Link href="/" className="text-slate-500 hover:text-slate-300 flex items-center gap-2 transition-colors">
                    <ArrowLeft size={18} /> Back to Blog
                </Link>
            </div>

            <h2 className="text-3xl font-bold mb-8">Edit Post</h2>

            <form action={handleSubmit} className="space-y-6 bg-slate-900/50 p-8 rounded-2xl border border-slate-800">
                <div className="space-y-2">
                    <label htmlFor="title" className="text-sm font-medium text-slate-400">Title</label>
                    <input
                        id="title"
                        name="title"
                        type="text"
                        defaultValue={post.title}
                        required
                        disabled={isSubmitting}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                        placeholder="Enter post title..."
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="tags" className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <Tags size={14} /> Tags (comma separated)
                    </label>
                    <input
                        id="tags"
                        name="tags"
                        type="text"
                        defaultValue={post.tags?.join(", ")}
                        disabled={isSubmitting}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 disabled:opacity-50"
                        placeholder="e.g. tech, news, vercel"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="content" className="text-sm font-medium text-slate-400">Content</label>
                    <textarea
                        id="content"
                        name="content"
                        defaultValue={post.content}
                        required
                        disabled={isSubmitting}
                        rows={8}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder:text-slate-700 resize-none disabled:opacity-50"
                        placeholder="Write your blog content here..."
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="attachment" className="text-sm font-medium text-slate-400">Attachment (Max 200MB)</label>
                    <div
                        className={`relative group ${isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        onClick={() => !isSubmitting && fileInputRef.current?.click()}
                    >
                        <input
                            id="attachment"
                            name="attachment"
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            disabled={isSubmitting}
                            className="hidden"
                        />
                        <div className={`w-full bg-slate-950 border border-slate-800 border-dashed rounded-xl px-4 py-6 flex flex-col items-center gap-3 transition-all ${!isSubmitting && 'group-hover:border-slate-600'}`}>
                            {fileName ? (
                                <>
                                    <div className="bg-teal-500/10 p-3 rounded-full">
                                        <Upload className="text-teal-400" size={32} />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-teal-400 text-sm font-medium">{fileName}</p>
                                        {!isSubmitting && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setFileName(null);
                                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                                }}
                                                className="text-slate-500 hover:text-rose-400 text-xs mt-2 flex items-center gap-1 mx-auto"
                                            >
                                                <X size={12} /> Remove file
                                            </button>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Upload className={`text-slate-600 transition-colors ${!isSubmitting && 'group-hover:text-teal-400'}`} size={32} />
                                    <div className="text-center">
                                        <p className="text-slate-400 text-sm font-medium">Click to select new attachment</p>
                                        <p className="text-slate-600 text-xs mt-1">Leaves existing if not changed</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20"
                >
                    {isSubmitting ? (
                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Save size={20} />
                    )}
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
            </form>
        </div>
    );
}
