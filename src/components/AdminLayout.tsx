import { useState } from "react";
import { Outlet, useNavigate, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, FileText, Menu, X } from "lucide-react";
import { DUMMY_ADMIN } from "@/data/dummyData";
import { cn } from "@/lib/utils";

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    console.log("🚪 Admin Logout", {
      admin: DUMMY_ADMIN.name,
      timestamp: new Date().toISOString(),
    });
    navigate("/");
  };

  const navItems = [
    { icon: Home, label: "Dashboard", path: "/admin" },
    { icon: FileText, label: "Device Logs", path: "/admin/logs" },
  ];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <div className="min-h-screen flex flex-col w-full">
      {/* Top App Bar */}
      <header className="h-16 glass border-b sticky top-0 z-50 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <h2 className="text-lg md:text-xl font-semibold text-foreground">
            Welcome, {DUMMY_ADMIN.name}
          </h2>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10 border-2 border-primary">
                <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                  {getInitials(DUMMY_ADMIN.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 glass" align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{DUMMY_ADMIN.name}</p>
                <p className="text-xs text-muted-foreground">{DUMMY_ADMIN.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs">
              Last login: {new Date(DUMMY_ADMIN.lastLogin).toLocaleString()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/admin/profile")}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex flex-1 w-full">
        {/* Sidebar */}
        <aside
          className={cn(
            "glass border-r transition-all duration-300 flex flex-col",
            sidebarOpen ? "w-64" : "w-0 md:w-16",
            "fixed md:sticky top-16 h-[calc(100vh-4rem)] z-40 overflow-hidden"
          )}
        >
          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/admin"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                    "hover:bg-accent text-foreground font-medium",
                    isActive && "bg-primary text-primary-foreground hover:bg-primary/90",
                    !sidebarOpen && "md:justify-center"
                  )
                }
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
