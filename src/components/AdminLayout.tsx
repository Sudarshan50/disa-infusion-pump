import { useState, useEffect } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Home, FileText, Menu, X } from "lucide-react";
import { DUMMY_ADMIN } from "@/data/dummyData";
import { cn } from "@/lib/utils";

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true); // Start open on desktop, will be adjusted for mobile
  const [isMobile, setIsMobile] = useState(false);

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768; // md breakpoint
      setIsMobile(mobile);
      // On mobile, close sidebar by default
      if (mobile) {
        setSidebarOpen(false);
      } else {
        // On desktop, open sidebar by default (if not explicitly closed)
        setSidebarOpen(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

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
    <TooltipProvider>
      <div className="min-h-screen flex flex-col w-full">
      {/* Top App Bar */}
      <header className="h-16 glass border-b sticky top-0 z-50 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <Menu className="h-5 w-5" />
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

      <div className="flex flex-1 w-full relative">
        {/* Mobile Backdrop */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Sidebar */}
        <aside
          className={cn(
            "glass border-r transition-all duration-300 flex flex-col h-[calc(100vh-4rem)] z-40",
            // Mobile: fixed positioning with slide animation
            "fixed md:sticky top-16 left-0",
            sidebarOpen 
              ? "w-64 translate-x-0" 
              : "w-64 -translate-x-full md:translate-x-0",
            // Desktop: change width only, no translation
            sidebarOpen 
              ? "md:w-64" 
              : "md:w-16",
            // Prevent overflow issues in collapsed state
            !sidebarOpen && "md:overflow-visible"
          )}
        >
          <nav className={cn("flex-1 space-y-2", sidebarOpen ? "p-4" : "px-2 py-4")}>
            {navItems.map((item) => {
              const navContent = (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/admin"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center rounded-xl transition-all hover:bg-accent text-foreground font-medium",
                      isActive && "bg-primary text-primary-foreground hover:bg-primary/90",
                      sidebarOpen ? "gap-3 px-4 py-3" : "justify-center p-2 w-12 h-12 mx-auto"
                    )
                  }
                >
                  <item.icon className={cn("h-5 w-5 flex-shrink-0", !sidebarOpen && "md:h-6 md:w-6")} />
                  {sidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
                </NavLink>
              );

              // Show tooltip only on desktop when sidebar is collapsed
              if (!sidebarOpen && !isMobile) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>
                      {navContent}
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return navContent;
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main 
          className={cn(
            "flex-1 p-4 md:p-6 lg:p-8 w-full transition-all duration-300",
            // On mobile, add margin when sidebar is open, on desktop no margin needed as sidebar is sticky
            sidebarOpen ? "md:ml-0" : "md:ml-0",
            "min-h-[calc(100vh-4rem)]"
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
    </TooltipProvider>
  );
};

export default AdminLayout;
