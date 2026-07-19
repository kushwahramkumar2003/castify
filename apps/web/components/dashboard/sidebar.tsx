"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RiGridLine,
  RiBarChartLine,
  RiVideoLine,
  RiMovieLine,
  RiTeamLine,
  RiKeyLine,
  RiUserLine,
  RiSettings3Line,
  RiShieldKeyholeLine,
  RiLogoutBoxRLine,
  RiTvLine,
} from "react-icons/ri";
import { PlanBadge } from "@/components/billing/plan-badge";

const SIDEBAR_BG = "#141414";
const BORDER = "#242424";

type NavItem = {
  title: string;
  href: string;
  icon: typeof RiGridLine;
  badge: string | null;
  /** When true, badge is filled from user plan (PRO / ENT) */
  planBadge?: boolean;
};

export const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Studio",
    items: [
      { title: "Overview", href: "/dashboard", icon: RiGridLine, badge: null },
      { title: "Analytics", href: "/dashboard/analytics", icon: RiBarChartLine, badge: null },
      { title: "Live Streams", href: "/dashboard/streams", icon: RiVideoLine, badge: "LIVE" },
      { title: "Recordings", href: "/dashboard/recordings", icon: RiMovieLine, badge: null },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Audience CRM", href: "/dashboard/crm", icon: RiTeamLine, badge: "CRM" },
      { title: "Stream Keys", href: "/dashboard/stream-keys", icon: RiKeyLine, badge: null },
      { title: "Profile", href: "/dashboard/profile", icon: RiUserLine, badge: null },
      { title: "Settings", href: "/dashboard/settings", icon: RiSettings3Line, badge: null },
      {
        title: "Billing",
        href: "/dashboard/billing",
        icon: RiShieldKeyholeLine,
        badge: null,
        planBadge: true,
      },
    ],
  },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  /** When true, render as full-width nav (mobile sheet) without fixed width chrome */
  mobile?: boolean;
  onNavigate?: () => void;
}

export function DashboardSidebar({ collapsed, onToggle: _onToggle, mobile = false, onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user?.username?.[0]?.toUpperCase() ?? "?");

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const showLabels = mobile || !collapsed;

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col transition-all duration-200 ease-in-out select-none",
        mobile && "w-full max-w-none border-0"
      )}
      style={
        mobile
          ? { background: SIDEBAR_BG, flexShrink: 0 }
          : {
              width: collapsed ? "60px" : "220px",
              background: SIDEBAR_BG,
              borderRight: `1px solid ${BORDER}`,
              flexShrink: 0,
            }
      }
    >
      {/* Header Logo */}
      <div
        className={cn(
          "flex h-14 items-center shrink-0 border-b border-border/40 px-4",
          !mobile && collapsed ? "justify-center px-0" : "justify-between"
        )}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 min-w-0"
          onClick={onNavigate}
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <RiTvLine className="size-4" />
          </div>
          {showLabels && (
            <div className="min-w-0">
              <span className="text-sm font-semibold tracking-tight block">castify</span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation list */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-5 overscroll-contain">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1.5">
            {showLabels && (
              <p className="px-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                {section.label}
              </p>
            )}
            <ul className={cn("space-y-0.5", !mobile && collapsed ? "px-1.5" : "px-2")}>
              {section.items.map((item) => {
                const active = isActive(item.href);
                const planLabel =
                  item.planBadge && user?.plan && user.plan !== "FREE"
                    ? user.plan === "ENTERPRISE"
                      ? "ENT"
                      : "PRO"
                    : item.planBadge && (!user?.plan || user.plan === "FREE")
                      ? "UP"
                      : null;
                const badgeText = planLabel ?? item.badge;
                const NavItem = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center rounded text-xs transition-all duration-150 w-full py-2.5 hover:bg-[#1a1a1a] hover:text-foreground",
                      mobile && "min-h-[44px] py-3",
                      active ? "bg-[#1f1f1f] text-emerald-400 font-semibold" : "text-[#a0a0a0]",
                      !mobile && collapsed ? "justify-center px-0 h-9" : "px-3 gap-2.5"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-emerald-400" : "text-[#8a8a8a]"
                      )}
                    />
                    {showLabels && (
                      <>
                        <span className="flex-1 truncate">{item.title}</span>
                        {badgeText && (
                          <span
                            className={cn(
                              "flex items-center rounded px-1.5 py-0.5 text-[8px] font-bold border",
                              badgeText === "LIVE"
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : badgeText === "PRO" || badgeText === "ENT"
                                  ? "bg-sky-500/10 text-sky-400 border-sky-500/25"
                                  : badgeText === "UP"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            )}
                          >
                            {badgeText}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );

                if (!mobile && collapsed) {
                  return (
                    <li key={item.href}>
                      <Tooltip>
                        <TooltipTrigger className="w-full flex justify-center">
                          {NavItem}
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{item.title}</TooltipContent>
                      </Tooltip>
                    </li>
                  );
                }
                return <li key={item.href}>{NavItem}</li>;
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer User Dropdown */}
      <div className="shrink-0 p-2 border-t border-border/40">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center rounded-md hover:bg-[#1f1f1f] text-left cursor-pointer transition-colors outline-none",
              !mobile && collapsed ? "justify-center p-1.5" : "p-1.5 gap-2.5",
              mobile && "min-h-[48px] px-2"
            )}
          >
              <Avatar className="size-7 shrink-0 rounded-md border border-border/50">
                <AvatarFallback className="rounded-md text-xs font-bold bg-[#1a1a1a] text-emerald-400">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {showLabels && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-[11px] font-medium truncate leading-none text-foreground/90">
                      {user?.username}
                    </p>
                    <PlanBadge plan={user?.plan} size="xs" href={null} />
                  </div>
                  <p className="text-[9px] text-muted-foreground truncate mt-1 leading-none">
                    {user?.email}
                  </p>
                </div>
              )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align={!mobile && collapsed ? "end" : "start"}
            className="w-52 mb-2 border border-border"
            sideOffset={8}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-2">
                <Avatar className="size-7 rounded">
                  <AvatarFallback className="rounded text-[10px] font-bold bg-[#1a1a1a] text-emerald-400">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {user?.fullName ?? user?.username}
                    </p>
                    <PlanBadge plan={user?.plan} size="xs" href={null} />
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                router.push("/dashboard/billing");
                onNavigate?.();
              }}
            >
              <RiShieldKeyholeLine className="size-3.5 mr-2 text-muted-foreground" />{" "}
              {user?.plan === "PRO" || user?.plan === "ENTERPRISE"
                ? "Manage plan"
                : "Upgrade to Pro"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                router.push("/dashboard/profile");
                onNavigate?.();
              }}
            >
              <RiUserLine className="size-3.5 mr-2 text-muted-foreground" /> My Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                router.push("/dashboard/settings");
                onNavigate?.();
              }}
            >
              <RiSettings3Line className="size-3.5 mr-2 text-muted-foreground" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                router.push("/dashboard/billing");
                onNavigate?.();
              }}
            >
              <RiShieldKeyholeLine className="size-3.5 mr-2 text-muted-foreground" /> Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={() => {
                void logout();
              }}
            >
              <RiLogoutBoxRLine className="size-3.5 mr-2" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
