import { getPosts, getAllTags, deletePost } from "./actions";
import Link from "next/link";
import { Paperclip, Plus, Download, Edit2, Trash2, Tag, CheckCircle2, X } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function Home({
    searchParams,
}: {
    searchParams: Promise<{ tag?: string; success?: string }>;
}) {
    const { tag, success } = await searchParams;
    const selectedTag = tag || "all";
    const posts = await getPosts(selectedTag);
    const tags = await getAllTags();
    const showSuccess = success === "true";

    return (
        <div className="space-y-8">
            {showSuccess && (
                <div className="bg-teal-500/10 border border-teal-500/20 p-4 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-3 text-teal-400">
                        <CheckCircle2 size={20} />
                        <span className="font-medium">Post published successfully!</span>
                    </div>
                    <Link href="/" className="text-slate-500 hover:text-slate-300">
                        <X size={18} />
                    </Link>
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar */}
                <aside className="w-full md:w-64 space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Tag size={14} /> Filter by Tags
                        </h3>
                        <div className="flex flex-wrap md:flex-col gap-2">
                            <Link
                                href="/"
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTag === "all"
                                    ? "bg-teal-500 text-white"
                                    : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                                    }`}
                            >
                                All Posts
                            </Link>
                            {tags.map((tag) => (
                                <Link
                                    key={tag}
                                    href={`/?tag=${tag}`}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedTag === tag
                                        ? "bg-teal-500 text-white"
                                        : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                                        }`}
                                >
                                    #{tag}
                                </Link>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <div className="flex-1 space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-semibold capitalize">
                            {selectedTag === "all" ? "Latest Posts" : `Posts tagged #${selectedTag}`}
                        </h2>
                        <Link
                            href="/new"
                            className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-teal-500/20"
                        >
                            <Plus size={18} /> New Post
                        </Link>
                    </div>

                    <div className="grid gap-6">
                        {posts.length === 0 ? (
                            <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
                                No posts found for this filter.
                            </div>
                        ) : (
                            posts.map((post) => (
                                <article
                                    key={post.id}
                                    className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl hover:border-slate-700 transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-teal-400 transition-colors">
                                                {post.title}
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {post.tags?.map((tag) => (
                                                    <span key={tag} className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Link
                                                href={`/edit/${post.id}`}
                                                className="p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-400/10 rounded-lg transition-all"
                                                title="Edit post"
                                            >
                                                <Edit2 size={16} />
                                            </Link>
                                            <form action={async () => {
                                                "use server";
                                                await deletePost(post.id);
                                            }}>
                                                <button
                                                    className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"
                                                    title="Delete post"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </form>
                                        </div>
                                    </div>

                                    <p className="text-slate-400 line-clamp-3 mb-6 leading-relaxed">
                                        {post.content}
                                    </p>

                                    <div className="flex justify-between items-center text-sm pt-4 border-t border-slate-800/50">
                                        <span className="text-slate-500 font-medium">
                                            {new Date(post.created_at).toLocaleDateString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </span>

                                        {post.attachment_name && (
                                            <a
                                                href={`/api/download/${post.id}`}
                                                className="flex items-center gap-2 text-teal-400 bg-teal-400/10 px-3 py-1.5 rounded-full hover:bg-teal-400/20 transition-all font-medium"
                                                download={post.attachment_name}
                                            >
                                                <Download size={14} />
                                                <span>{post.attachment_name}</span>
                                            </a>
                                        )}
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
