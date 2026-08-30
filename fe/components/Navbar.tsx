"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { LogOut, User, LayoutDashboard, Briefcase, CheckSquare, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [hasMachines, setHasMachines] = useState(false);

  useEffect(() => {
    if (session) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"}/api/check/me`, { credentials: "include" })
        .then((res) => res.json())
        .then((user) => {
          if (user?.machineCount && user.machineCount > 0) {
            setHasMachines(true);
          }
        })
        .catch(console.error);
    }
  }, [session]);

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  const isActive = (path: string) => pathname === path;

  if (isPending || !session) {
    return null;
  }

  const navLinks = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/jobs", label: "Jobs", icon: Briefcase },
    { href: "/approvals", label: "Approvals", icon: CheckSquare },
    { href: "/machines", label: "Machines", icon: Monitor },
  ];

  // Show Approvals link only for machine owners
  const showApprovals = hasMachines;

  return (
    <nav className="border-b border-border bg-background">
      <div className="container mx-auto px-4 h-12 flex items-center justify-between">
        {/* Logo/Brand */}
        <Link href="/" className="font-bold text-lg flex items-center gap-2">
          <div className="h-3 w-3 bg-primary animate-pulse" />
          <span className="tracking-widest uppercase font-mono">GridNode</span>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center space-x-1">
          {navLinks
            .filter((link) => link.href !== "/approvals" || showApprovals)
            .map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-2 px-3 py-1.5 text-[10px] uppercase font-mono tracking-wider transition-colors border border-transparent ${
                    active
                      ? "bg-card border-border text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/50 hover:border-border/50"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
        </div>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 hover:bg-card border border-transparent hover:border-border transition-colors">
              <span className="text-[10px] uppercase font-mono text-muted-foreground">{session.user.name}</span>
              <div className="h-4 w-4 bg-muted border border-border flex items-center justify-center text-[8px] font-mono">
                {session.user.name?.charAt(0)?.toUpperCase()}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 rounded-none border-border" align="end" forceMount>
            <DropdownMenuLabel className="font-normal rounded-none">
              <div className="flex flex-col space-y-1 font-mono">
                <p className="text-xs font-medium leading-none">{session.user.name}</p>
                <p className="text-[10px] leading-none text-muted-foreground">{session.user.email}</p>
                {hasMachines && (
                  <p className="text-[10px] leading-none text-primary mt-1">PROVIDER_ACTIVE</p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem onClick={() => router.push("/")} className="rounded-none font-mono text-xs cursor-pointer focus:bg-card focus:text-foreground">
              <User className="mr-2 h-3 w-3" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem onClick={handleLogout} className="rounded-none font-mono text-xs cursor-pointer focus:bg-destructive focus:text-destructive-foreground text-destructive">
              <LogOut className="mr-2 h-3 w-3" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
