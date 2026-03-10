"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
    const router = useRouter();

    const handleLogout = () => {
        document.cookie = "isLoggedIn=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
        router.push("/login");
        router.refresh();
    };

    return (
        <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-rose-400 transition-colors bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg hover:border-rose-500/30 hover:bg-rose-500/10"
        >
            <LogOut size={16} />
            <span>Logout</span>
        </button>
    );
}
