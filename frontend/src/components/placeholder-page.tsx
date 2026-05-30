import { Construction } from "lucide-react";

export function PlaceholderPage({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="glass rounded-xl p-10 grid place-items-center text-center">
        <Construction className="h-10 w-10 text-muted-foreground mb-3" />
        <div className="text-sm font-medium">Coming in {phase}</div>
        <div className="text-xs text-muted-foreground mt-1">
          This module is scaffolded and will be implemented in the indicated phase.
        </div>
      </div>
    </div>
  );
}
