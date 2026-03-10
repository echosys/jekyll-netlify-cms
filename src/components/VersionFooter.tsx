import versionData from "../lib/version.json";

export default function VersionFooter() {
    const { version, buildTime, commitSha } = versionData as { version: string, buildTime: string, commitSha: string };

    return (
        <footer className="mt-20 py-6 border-t border-slate-800 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6">
            <p>Version: <span className="font-mono text-slate-400">{version}</span></p>
            {commitSha && <p>Commit: <span className="font-mono text-slate-400">{commitSha}</span></p>}
            {buildTime && <p>Built: <span className="font-mono text-slate-400">{new Date(buildTime).toLocaleString()}</span></p>}
        </footer>
    );
}
