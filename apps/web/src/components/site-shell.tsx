"use client";

import { usePathname } from "next/navigation";
import {
  BookMarked,
  CalendarDays,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Sparkles,
  Users,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { Sidebar, type SidebarSection } from "./sidebar";

const adminItems = [
  {
    href: "/admin",
    label: "Overview",
    hint: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/admin/classes",
    label: "Classes",
    hint: "Schedule & capacity",
    icon: CalendarDays,
  },
  {
    href: "/admin/members",
    label: "Members",
    hint: "Profiles & credits",
    icon: Users,
  },
  {
    href: "/admin/overbooking",
    label: "Overbooking advisor",
    hint: "Grok decisions",
    icon: Sparkles,
  },
];

const memberItems = [
  {
    href: "/book",
    label: "Classes",
    hint: "Browse & book",
    icon: CalendarDays,
  },
  {
    href: "/my",
    label: "My bookings",
    hint: "Upcoming & history",
    icon: BookMarked,
  },
  {
    href: "/health",
    label: "Health",
    hint: "Bloodwork & readiness",
    icon: FlaskConical,
  },
  {
    href: "/features",
    label: "Features",
    hint: "What Gymflow does",
    icon: ListChecks,
  },
];

// Routes where the app shell (sidebar + content frame) makes sense.
// The marketing landing and auth-only pages stay full-width.
const APP_ROUTE_PREFIXES = ["/admin", "/book", "/my", "/health"] as const;

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready } = useSession();

  const inAppRoute = APP_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const inAdminScope = pathname === "/admin" || pathname.startsWith("/admin/");

  // Anonymous visitors and non-app pages skip the shell entirely.
  if (!ready || !user || !inAppRoute) return <>{children}</>;

  const sections: SidebarSection[] = inAdminScope
    ? [{ label: "Admin", items: adminItems }]
    : [{ label: "Member", items: memberItems }];

  return (
    <div className="mx-auto flex max-w-7xl gap-0 lg:gap-6 lg:px-6 lg:py-6">
      <Sidebar sections={sections} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
