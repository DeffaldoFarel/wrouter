"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Server,
  Link2,
  ScrollText,
  Settings,
  LogOut,
  Sun,
  Moon,
  HeartPulse,
  Zap,
  ChevronLeft,
  ChevronRight,
  Menu,
  ExternalLink,
  BookOpen,
  User,
  Code2,
} from "lucide-react";

// ─────────────────────────────────────────────
//  Types & Data
// ─────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  description?: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Main",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Overview & stats",
      },
      {
        label: "Providers",
        href: "/dashboard/providers",
        icon: Server,
        description: "Manage AI providers",
      },
      {
        label: "Combos",
        href: "/dashboard/combos",
        icon: Link2,
        description: "Fallback chains",
      },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        label: "Usage",
        href: "/dashboard/usage",
        icon: ScrollText,
        description: "Real-time analytics",
      },
      {
        label: "Health Check",
        href: "/dashboard/health",
        icon: HeartPulse,
        description: "Provider status",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
        description: "Configuration",
      },
    ],
  },
];

const STORAGE_KEY = "wrouter:sidebar-collapsed";

// ─────────────────────────────────────────────
//  Logo Component
// ─────────────────────────────────────────────

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 group"
      title="WRouter"
    >
      <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shrink-0 ring-1 ring-primary/20 transition-transform group-hover:scale-105">
        <Zap className="h-5 w-5" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight">WRouter</h1>
          <p className="text-[10px] text-muted-foreground truncate">
            AI API Router
          </p>
        </div>
      )}
    </Link>
  );
}

// ─────────────────────────────────────────────
//  Nav Link
// ─────────────────────────────────────────────

function NavLink({
  item,
  isActive,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`group/link relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {/* Left active indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
      )}
      <Icon
        className={`h-4 w-4 shrink-0 transition-transform group-hover/link:scale-110 ${
          isActive ? "text-primary" : ""
        }`}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={linkContent} />
        <TooltipContent side="right" className="font-medium">
          {item.label}
          {item.description && (
            <span className="ml-2 text-xs text-muted-foreground">
              {item.description}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }
  return linkContent;
}

// ─────────────────────────────────────────────
//  Sidebar Body (shared between desktop & mobile)
// ─────────────────────────────────────────────

function SidebarBody({
  collapsed,
  isActive,
  onNavigate,
  onToggleTheme,
  theme,
  onLogout,
}: {
  collapsed: boolean;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
  onToggleTheme: () => void;
  theme: string | undefined;
  onLogout: () => void;
}) {
  return (
    <>
      {/* Logo */}
      <div className={`p-4 border-b ${collapsed ? "px-3" : ""}`}>
        <Logo collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={section.label} className={idx > 0 ? "mt-4" : ""}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                {section.label}
              </p>
            )}
            {collapsed && idx > 0 && (
              <div className="mx-3 mb-2 border-t border-border/50" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={isActive(item.href)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* External Links (visible only when expanded) */}
      {!collapsed && (
        <div className="px-5 py-2 border-t">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <a
              href="https://github.com/DeffaldoFarel/wrouter"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Code2 className="h-3 w-3" />
              GitHub
            </a>
            <a
              href="https://github.com/DeffaldoFarel/wrouter/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              Changelogs
            </a>
            <span className="ml-auto text-muted-foreground/50">
              <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="p-3 border-t space-y-1">
        {/* Theme toggle */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={onToggleTheme}
                  className="flex items-center justify-center w-full h-9 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </button>
              }
            />
            <TooltipContent side="right">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onToggleTheme}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" />
            )}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        )}

        {/* Logout */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={onLogout}
                  className="flex items-center justify-center w-full h-9 rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              }
            />
            <TooltipContent side="right">Logout</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 w-full transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Logout</span>
          </button>
        )}

        {/* Admin badge (only when expanded) */}
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-muted/40 mt-1">
            <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/15 text-primary shrink-0">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium leading-tight">Admin</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Logged in
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
//  Loading Skeleton
// ─────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 border-r bg-card flex flex-col shrink-0 h-screen sticky top-0 animate-pulse">
        <div className="p-4 border-b flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-muted" />
          <div className="space-y-1.5">
            <div className="h-3 w-20 bg-muted rounded" />
            <div className="h-2 w-16 bg-muted rounded" />
          </div>
        </div>
        <div className="flex-1 p-3 space-y-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-9 bg-muted rounded-md" />
          ))}
        </div>
        <div className="p-3 border-t space-y-1">
          <div className="h-9 bg-muted rounded-md" />
          <div className="h-9 bg-muted rounded-md" />
        </div>
      </aside>
      <main className="flex-1 p-8 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Main Layout
// ─────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Restore collapsed state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "true") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Auth check with timeout to prevent infinite skeleton
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    fetch("/api/auth/check", { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout);
        if (!res.ok) {
          router.push("/login");
        } else {
          setAuthenticated(true);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Persist collapsed state
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  async function performLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } finally {
      setLoggingOut(false);
      setLogoutDialogOpen(false);
    }
  }

  if (loading) return <LoadingSkeleton />;
  if (!authenticated) return null;

  // Get active page label for mobile header
  const allItems = NAV_SECTIONS.flatMap((s) => s.items);
  const activePage = allItems.find((i) => isActive(i.href));

  return (
    <TooltipProvider delay={150}>
      <div className="flex h-screen overflow-hidden">
        {/* ═══ Desktop Sidebar ═══ */}
        <aside
          className={`hidden lg:flex border-r bg-card flex-col shrink-0 h-screen sticky top-0 transition-[width] duration-200 relative ${
            collapsed ? "w-[68px]" : "w-64"
          }`}
        >
          <SidebarBody
            collapsed={collapsed}
            isActive={isActive}
            onToggleTheme={toggleTheme}
            theme={theme}
            onLogout={() => setLogoutDialogOpen(true)}
          />

          {/* Collapse toggle (floating on right edge) */}
          <button
            onClick={toggleCollapsed}
            className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full bg-background border-2 border-border shadow-sm flex items-center justify-center hover:border-primary/50 hover:bg-accent transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronLeft className="h-3 w-3" />
            )}
          </button>
        </aside>

        {/* ═══ Mobile Sidebar (Sheet) ═══ */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-64 flex flex-col">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBody
              collapsed={false}
              isActive={isActive}
              onNavigate={() => setMobileOpen(false)}
              onToggleTheme={toggleTheme}
              theme={theme}
              onLogout={() => {
                setMobileOpen(false);
                setLogoutDialogOpen(true);
              }}
            />
          </SheetContent>
        </Sheet>

        {/* ═══ Main Content ═══ */}
        <main className="flex-1 overflow-y-auto">
          {/* Mobile top bar */}
          <div className="lg:hidden sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileOpen(true)}
              className="h-9 w-9 p-0"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              {activePage && (
                <>
                  <activePage.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{activePage.label}</span>
                </>
              )}
            </div>
            <button
              onClick={toggleTheme}
              className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>

        {/* ═══ Logout Confirmation Dialog ═══ */}
        <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogOut className="h-5 w-5 text-muted-foreground" />
                Sign out?
              </DialogTitle>
              <DialogDescription>
                You&apos;ll need to log in again to access the dashboard.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setLogoutDialogOpen(false)}
                disabled={loggingOut}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={performLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Signing out..." : "Sign out"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
