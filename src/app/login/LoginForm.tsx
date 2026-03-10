"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export default function LoginForm() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simple mock login: set a cookie indicating logged-in state
        document.cookie = "isLoggedIn=true; path=/; max-age=86400;"; // 1 day expiration
        router.push("/");
        router.refresh(); // Ensure the router picks up the new state and renders layout/pages correctly
    };

    return (
        <form onSubmit={handleLogin} className="mt-8 space-y-6">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
                    <input
                        type="text"
                        placeholder="admin"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-teal-500 transition-colors"
                        disabled // Disabled until implemented
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
                    <input
                        type="password"
                        placeholder="••••••••"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-teal-500 transition-colors"
                        disabled // Disabled until implemented
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white font-medium py-3 rounded-lg flex justify-center items-center gap-2 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? (
                    <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                    <>
                        <LogIn size={20} />
                        Login to Dashboard
                    </>
                )}
            </button>
            <p className="text-center text-xs text-slate-500 mt-4">Username and password validation is currently disabled.</p>
        </form>
    );
}
