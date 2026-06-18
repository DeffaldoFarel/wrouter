import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseChangelog } from "@/lib/changelog-parser";
import type { Change, ChangeType } from "@/lib/changelog";

const changelog = parseChangelog();

const changeTypeConfig: Record<ChangeType, { label: string; className: string; icon: string }> = {
  added: {
    label: "Added",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: "✨",
  },
  changed: {
    label: "Changed",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: "🔧",
  },
  fixed: {
    label: "Fixed",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: "🐛",
  },
};

function ChangeItem({ change }: { change: Change }) {
  const config = changeTypeConfig[change.type];
  return (
    <div className="flex items-start gap-3 py-2">
      <Badge className={`${config.className} shrink-0 text-xs font-medium px-2 py-0.5`}>
        {config.icon} {config.label}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{change.title}</p>
        <p className="text-sm text-muted-foreground">{change.description}</p>
      </div>
    </div>
  );
}

function ReleaseCard({ version, date, changes }: { version: string; date: string; changes: Change[] }) {
  const groupedChanges: Record<ChangeType, Change[]> = { added: [], changed: [], fixed: [] };
  changes.forEach((change) => groupedChanges[change.type].push(change));

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <span className="text-2xl">🚀</span>
            v{version}
          </CardTitle>
          <span className="text-sm text-muted-foreground">{date}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["added", "changed", "fixed"] as ChangeType[]).map((type) => {
          if (groupedChanges[type].length === 0) return null;
          const config = changeTypeConfig[type];
          return (
            <div key={type}>
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <span>{config.icon}</span>
                {config.label}
              </h4>
              <div className="space-y-1 pl-6 border-l-2 border-border">
                {groupedChanges[type].map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function ChangelogPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <span className="text-4xl">📋</span>
          Changelog
        </h1>
        <p className="text-muted-foreground">
          Track version history and feature updates for WRouter.
        </p>
      </div>

      <div className="space-y-2">
        {changelog.map((release) => (
          <ReleaseCard
            key={release.version}
            version={release.version}
            date={release.date}
            changes={release.changes}
          />
        ))}
      </div>

      <div className="text-center text-sm text-muted-foreground pt-6 border-t">
        <p>
          For more details, visit the{" "}
          <a
            href="https://github.com/your-org/wrouter"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            GitHub Repository
          </a>
        </p>
      </div>
    </div>
  );
}
