import { checkDbHealth } from "../actions";
import LoginForm from "./LoginForm";
import { Database } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
    const dbHealth = await checkDbHealth();

    return (
        <div className="max-w-md mx-auto mt-24">
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl shadow-xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent mb-2">
                        Vercel Blog
                    </h1>
                    <p className="text-slate-400">Sign in to manage posts</p>
                </div>

                <div className="mb-6 p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Database size={18} className="text-slate-400" />
                        <span className="text-sm font-medium text-slate-300">Database Status</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500">{dbHealth.host}</span>
                        <div className="relative flex items-center justify-center w-3 h-3">
                            {dbHealth.status === 'green' && (
                                <>
                                    <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-teal-400"></span>
                                    <span className="relative inline-flex rounded-full w-2 h-2 bg-teal-500"></span>
                                </>
                            )}
                            {dbHealth.status === 'yellow' && (
                                <span className="relative inline-flex rounded-full w-2 h-2 bg-yellow-500"></span>
                            )}
                            {dbHealth.status === 'red' && (
                                <>
                                    <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-rose-400"></span>
                                    <span className="relative inline-flex rounded-full w-2 h-2 bg-rose-500"></span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <LoginForm />
            </div>
        </div>
    );
}
