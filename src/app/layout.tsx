import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import VersionFooter from "../components/VersionFooter";
import LogoutButton from "../components/LogoutButton";
import { cookies } from "next/headers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Vercel Blog",
    description: "A high-performance blog powered by Next.js and Postgres",
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const cookieStore = await cookies();
    const isLoggedIn = cookieStore.has("isLoggedIn");

    return (
        <html lang="en">
            <body className={`${inter.className} bg-slate-950 text-slate-100 min-h-screen flex flex-col`}>
                <div className="max-w-6xl mx-auto w-full px-6 py-12 flex-1">
                    <header className="mb-12 border-b border-slate-800 pb-8 flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                                Vercel Blog
                            </h1>
                            <p className="text-slate-400 mt-2">Postgres-Powered Content Hub</p>
                        </div>
                        {isLoggedIn && <LogoutButton />}
                    </header>
                    <main>{children}</main>
                </div>
                <VersionFooter />
            </body>
        </html>
    );
}
