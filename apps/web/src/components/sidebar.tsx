"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarItem {
  href: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

export interface SidebarSection {
  label?: string;
  items: SidebarItem[];
}

export function Sidebar({ sections }: { sections: SidebarSection[] }) {
  const pathname = usePathname();
  const isActive = (item: SidebarItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <>
      <aside className="sticky top-20 hidden h-[calc(100vh-5.5rem)] w-60 shrink-0 self-start lg:block">
        <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-soft">
          {sections.map((section, i) => (
            <div
              key={section.label ?? i}
              className={i > 0 ? "mt-3 border-t border-ink-100 pt-3" : ""}
            >
              {section.label && (
                <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">
                  {section.label}
                </div>
              )}
              <nav className="space-y-0.5">
                {section.items.map((item) => (
                  <DesktopLink
                    key={item.href}
                    item={item}
                    active={isActive(item)}
                  />
                ))}
              </nav>
            </div>
          ))}
        </div>
      </aside>

      <MobileTabs sections={sections} isActive={isActive} />
    </>
  );
}

function DesktopLink({
  item,
  active,
}: {
  item: SidebarItem;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-ink-900 text-white shadow-soft"
          : "text-ink-700 hover:bg-ink-50"
      }`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          active ? "text-white" : "text-ink-400"
        }`}
      />
      <div className="min-w-0">
        <div className="truncate font-medium leading-tight">{item.label}</div>
        {item.hint && (
          <div
            className={`mt-0.5 truncate text-[11px] leading-tight ${
              active ? "text-white/70" : "text-ink-400"
            }`}
          >
            {item.hint}
          </div>
        )}
      </div>
    </Link>
  );
}

function MobileTabs({
  sections,
  isActive,
}: {
  sections: SidebarSection[];
  isActive: (item: SidebarItem) => boolean;
}) {
  const all = sections.flatMap((s) => s.items);
  return (
    <div className="-mx-6 mb-4 overflow-x-auto border-b border-ink-100 bg-white px-6 lg:hidden">
      <nav className="flex min-w-max gap-1 py-2">
        {all.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-ink-900 text-white"
                  : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
